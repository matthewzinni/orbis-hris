// =========================
// EMPLOYEE TYPES
// =========================

export interface EmployeeFlags {
    atRisk?: boolean;
    impactPlayer?: boolean;
    disciplineRisk?: boolean;
}

export interface Employee {
    // Core IDs
    id?: string;
    dbId?: string;
    employee_id?: string;
    employeeId?: string;

    // Name
    first_name: string;
    last_name: string;

    // Employment Info
    department?: string;
    position?: string;
    supervisor?: string;

    /** Overseas / remote (Attendance roll call grouping). */
    is_remote?: boolean;

    // Status
    status?: 'Active' | 'Inactive' | 'Terminated' | 'Leave';
    pay_type?: 'Hourly' | 'Salary';
    standard_hours?: number | string;

    // Dates
    hire_date?: string;
    next_review_date?: string;
    anniversary_date?: string;

    // Contact
    email?: string;
    phone?: string;

    // Metrics
    tenureMonths?: number;
    reviewScore?: number;
    openIncidentCount?: number;
    manualRiskReason?: string;
    disciplineLevel?: string;

    // Flags
    flags?: EmployeeFlags;

    // Flexible fallback
    [key: string]: any;
}