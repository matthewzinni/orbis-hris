export type CareMatrixRowKey =
  | 'employees'
  | 'employeesFamilies'
  | 'community'
  | 'customers'
  | 'suppliers';

export type CareMatrixColumnKey = 'physical' | 'emotional' | 'spiritual';

export type CareCellStatus =
  | 'current'
  | 'gap'
  | 'proposed'
  | 'in_progress'
  | 'complete';

export type CareItemType = 'physical' | 'emotional' | 'spiritual';

export type CareItemStatus =
  | 'open'
  | 'in_progress'
  | 'follow_up'
  | 'resolved'
  | 'closed';

export type CareConfidentiality = 'standard' | 'restricted' | 'hr_only';

export type RecognitionType =
  | 'kudos'
  | 'iron_shift'
  | 'work_anniversary'
  | 'above_and_beyond'
  | 'peer_recognition';

export interface CareMatrixCellEntry {
  id: string;
  row: CareMatrixRowKey;
  column: CareMatrixColumnKey;
  initiatives: string;
  gaps: string;
  proposedActions: string;
  owner: string;
  dueDate: string;
  status: CareCellStatus;
}

export interface CareTrackerItem {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  type: CareItemType;
  needOrConcern: string;
  actionTaken: string;
  owner: string;
  followUpDate: string;
  status: CareItemStatus;
  confidentiality: CareConfidentiality;
}

export interface CareRecognitionEntry {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  type: RecognitionType;
  summary: string;
  recognizedOn: string;
  recognizedBy: string;
}

export interface CarePulseSurveySnapshot {
  id?: string;
  overallSupport: number;
  workloadStress: number;
  communication: number;
  recognition: number;
  belonging: number;
  commentsSummary: string;
  periodLabel: string;
  responseCount: number;
  createdAt?: string;
}

export interface EmployeeCareNote {
  id: string;
  employeeId: string;
  date: string;
  author: string;
  summary: string;
  confidentiality: CareConfidentiality;
}

export interface EmployeeCareFollowUp {
  id: string;
  employeeId: string;
  title: string;
  dueDate: string;
  owner: string;
  status: CareItemStatus;
}

export interface EmployeeCareResource {
  id: string;
  employeeId: string;
  resourceName: string;
  sharedOn: string;
  sharedBy: string;
}

export interface EmployeeWellnessCheckIn {
  id: string;
  employeeId: string;
  checkInDate: string;
  type: string;
  notes: string;
  owner: string;
}

export interface CareEngagementDataset {
  matrixCells: CareMatrixCellEntry[];
  careItems: CareTrackerItem[];
  recognition: CareRecognitionEntry[];
  pulse: CarePulseSurveySnapshot;
  pulseSnapshots: CarePulseSurveySnapshot[];
  employeeNotes: EmployeeCareNote[];
  followUps: EmployeeCareFollowUp[];
  resources: EmployeeCareResource[];
  wellnessCheckIns: EmployeeWellnessCheckIn[];
}

export interface CareEngagementKpis {
  openCareItems: number;
  employeesNeedingFollowUp: number;
  recognitionThisMonth: number;
  careGapsIdentified: number;
  activeSupportInitiatives: number;
  upcomingCheckIns: number;
}
