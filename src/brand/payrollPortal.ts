/** Accountants Office → Payroll Relief Employee Center (firm code pre-filled). */
export const PAYROLL_RELIEF_FIRM_CODE = 'KATYL8287';

const PAYROLL_RELIEF_RETURN_URL = 'https://EmployeeCenter.payrollrelief.com/account/login';

export const PAYROLL_RELIEF_LOGIN_URL = `https://login.accountantsoffice.com/login?firmCode=${encodeURIComponent(PAYROLL_RELIEF_FIRM_CODE)}&returnurl=${encodeURIComponent(PAYROLL_RELIEF_RETURN_URL)}`;

export function applyPayrollReliefLinks(root: ParentNode = document): void {
  root.querySelectorAll<HTMLAnchorElement>('[data-payroll-relief-link]').forEach((link) => {
    link.href = PAYROLL_RELIEF_LOGIN_URL;
  });
}
