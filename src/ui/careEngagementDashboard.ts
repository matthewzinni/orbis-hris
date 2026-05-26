import type {
  CareEngagementDataset,
  CareEngagementKpis,
  CareMatrixCellEntry,
} from '../types/careEngagementTypes';

function isOpenCareStatus(status: string): boolean {
  return ['open', 'in_progress', 'follow_up'].includes(status);
}

function isThisMonth(dateValue: string): boolean {
  if (!dateValue) return false;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function isUpcoming(dateValue: string, withinDays = 14): boolean {
  if (!dateValue) return false;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setDate(end.getDate() + withinDays);
  return d >= now && d <= end;
}

export function computeCareEngagementKpis(dataset: CareEngagementDataset): CareEngagementKpis {
  const openCareItems = dataset.careItems.filter((item) => isOpenCareStatus(item.status)).length;

  const followUpEmployeeIds = new Set<string>();
  dataset.careItems.forEach((item) => {
    if (isOpenCareStatus(item.status) && item.followUpDate) {
      followUpEmployeeIds.add(item.employeeId);
    }
  });
  dataset.followUps.forEach((item) => {
    if (isOpenCareStatus(item.status)) {
      followUpEmployeeIds.add(item.employeeId);
    }
  });

  const recognitionThisMonth = dataset.recognition.filter((entry) =>
    isThisMonth(entry.recognizedOn)
  ).length;

  const careGapsIdentified = dataset.matrixCells.filter(
    (cell) => cell.status === 'gap' || String(cell.gaps || '').trim().length > 0
  ).length;

  const activeSupportInitiatives = dataset.matrixCells.filter((cell) =>
    ['current', 'in_progress', 'proposed'].includes(cell.status)
  ).length;

  const upcomingCheckIns =
    dataset.careItems.filter((item) => isUpcoming(item.followUpDate)).length +
    dataset.followUps.filter((item) => isUpcoming(item.dueDate)).length +
    dataset.wellnessCheckIns.filter((item) => isUpcoming(item.checkInDate, 30)).length;

  return {
    openCareItems,
    employeesNeedingFollowUp: followUpEmployeeIds.size,
    recognitionThisMonth,
    careGapsIdentified,
    activeSupportInitiatives,
    upcomingCheckIns,
  };
}

export function loadCareEngagementKpis(
  dataset: CareEngagementDataset,
  setText: (id: string, value: string) => void
): void {
  const kpis = computeCareEngagementKpis(dataset);

  setText('kCareOpenItems', String(kpis.openCareItems));
  setText('kCareFollowUp', String(kpis.employeesNeedingFollowUp));
  setText('kCareRecognitionMonth', String(kpis.recognitionThisMonth));
  setText('kCareGaps', String(kpis.careGapsIdentified));
  setText('kCareInitiatives', String(kpis.activeSupportInitiatives));
  setText('kCareCheckIns', String(kpis.upcomingCheckIns));
}

export function findMatrixCell(
  cells: CareMatrixCellEntry[],
  row: string,
  column: string
): CareMatrixCellEntry | undefined {
  return cells.find((cell) => cell.row === row && cell.column === column);
}
