type CandidatesModule = typeof import('./candidates');

let candidatesModulePromise: Promise<CandidatesModule> | null = null;

function ensureCandidatesModule(): Promise<CandidatesModule> {
  if (!candidatesModulePromise) {
    candidatesModulePromise = import('./candidates').catch((err) => {
      candidatesModulePromise = null;
      throw err;
    });
  }

  return candidatesModulePromise;
}

function reportCandidateLoadFailure(err: unknown): void {
  console.error('[Candidates] Module load failed:', err);
  window.showToast?.('Could not load the Candidates module.', 'error');
}

export async function loadCandidates(): Promise<void> {
  const mod = await ensureCandidatesModule();
  await mod.loadCandidates();
}

export function editCandidateRecord(
  record: Parameters<CandidatesModule['editCandidateRecord']>[0]
): void {
  void ensureCandidatesModule()
    .then((mod) => mod.editCandidateRecord(record))
    .catch(reportCandidateLoadFailure);
}

export async function saveCandidateRecord(): Promise<void> {
  const mod = await ensureCandidatesModule();
  await mod.saveCandidateRecord();
}

export async function deleteCandidateRecord(candidateId?: string): Promise<void> {
  const mod = await ensureCandidatesModule();
  await mod.deleteCandidateRecord(candidateId);
}

export async function moveCandidateToStage(candidateId: string, newStage: string): Promise<void> {
  const mod = await ensureCandidatesModule();
  await mod.moveCandidateToStage(candidateId, newStage);
}

export async function convertCandidateToEmployee(candidateId: string): Promise<boolean> {
  const mod = await ensureCandidatesModule();
  return mod.convertCandidateToEmployee(candidateId);
}
