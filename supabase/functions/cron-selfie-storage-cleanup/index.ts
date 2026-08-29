// Vardhnam evidence retention worker. The legacy function name is retained so
// existing cron schedules call the hardened implementation. Deletion defaults
// to dry-run unless EVIDENCE_RETENTION_EXECUTE=true.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Candidate = {
  organization_id: string;
  source_type: 'ATTENDANCE' | 'VISIT' | 'COLLECTION';
  record_id: string;
  bucket_id: 'selfies' | 'visit-evidence' | 'collection-proof';
  object_path: string;
};

const response = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

Deno.serve(async (req: Request) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader = req.headers.get('Authorization') || '';
  const cronHeader = req.headers.get('x-cron-secret');
  const authorized = Boolean(
    (cronSecret && (authHeader === `Bearer ${cronSecret}` || cronHeader === cronSecret))
    || (serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`)
  );
  if (!authorized) return response(401, { success: false, message: 'Unauthorized' });

  let body: { dryRun?: boolean; limit?: number } = {};
  try { if (req.method !== 'GET') body = await req.json(); } catch { body = {}; }
  const executionEnabled = Deno.env.get('EVIDENCE_RETENTION_EXECUTE') === 'true';
  const dryRun = body.dryRun ?? !executionEnabled;
  if (!dryRun && !executionEnabled) {
    return response(409, { success: false, message: 'Deletion is disabled. Set EVIDENCE_RETENTION_EXECUTE=true after policy approval.' });
  }
  const limit = Math.max(1, Math.min(Number(body.limit) || 500, 1000));
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey!);

  const { data: run, error: runError } = await admin.from('evidence_cleanup_runs')
    .insert({ dry_run: dryRun }).select('id').single();
  if (runError || !run) return response(500, { success: false, message: runError?.message || 'Could not create cleanup run.' });

  let deleted = 0;
  let failed = 0;
  try {
    const { data, error } = await admin.rpc('list_expired_evidence', { p_limit: limit });
    if (error) throw error;
    const candidates = (data || []) as Candidate[];
    const auditItems = candidates.map((candidate) => ({
      run_id: run.id, organization_id: candidate.organization_id, source_type: candidate.source_type,
      record_id: candidate.record_id, bucket_id: candidate.bucket_id, object_path: candidate.object_path,
      outcome: dryRun ? 'DRY_RUN' : 'PENDING',
    }));
    if (auditItems.length > 0) {
      const { error: auditError } = await admin.from('evidence_cleanup_items').insert(auditItems);
      if (auditError) throw auditError;
    }

    for (const candidate of candidates) {
      if (dryRun) continue;

      let outcome: 'DELETED' | 'FAILED' = 'FAILED';
      let itemError: string | undefined;
      try {
        const { error: deleteError } = await admin.storage.from(candidate.bucket_id).remove([candidate.object_path]);
        if (deleteError) throw deleteError;
        const { data: referenceCleared, error: clearError } = await admin.rpc('mark_evidence_deleted', {
          p_source_type: candidate.source_type,
          p_record_id: candidate.record_id,
          p_expected_path: candidate.object_path,
        });
        if (clearError) throw clearError;
        if (!referenceCleared) throw new Error('Database evidence reference changed during cleanup.');
        outcome = 'DELETED';
        deleted += 1;
      } catch (error: any) {
        itemError = error?.message || 'Unknown cleanup error';
        failed += 1;
      }
      const { error: auditError } = await admin.from('evidence_cleanup_items').update({ outcome, error: itemError })
        .eq('run_id', run.id).eq('source_type', candidate.source_type).eq('record_id', candidate.record_id);
      if (auditError) throw auditError;
    }
    await admin.from('evidence_cleanup_runs').update({
      status: 'COMPLETED', completed_at: new Date().toISOString(), candidate_count: candidates.length,
      deleted_count: deleted, failed_count: failed,
    }).eq('id', run.id);
    return response(200, { success: true, runId: run.id, dryRun, candidates: candidates.length, deleted, failed });
  } catch (error: any) {
    const message = error?.message || 'Evidence cleanup failed.';
    await admin.from('evidence_cleanup_runs').update({
      status: 'FAILED', completed_at: new Date().toISOString(), deleted_count: deleted,
      failed_count: failed, error: message,
    }).eq('id', run.id);
    return response(500, { success: false, runId: run.id, dryRun, deleted, failed, message });
  }
});
