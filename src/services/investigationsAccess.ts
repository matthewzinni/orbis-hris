import { isAdminUser } from './access';
import type { Investigation } from '../types/investigationsTypes';

export const INVESTIGATION_INVESTIGATOR_NAME = 'Matthew Zinni';
export const INVESTIGATION_INVESTIGATOR_EMAIL = 'matthew.zinni@btwglobal.com';

export function canAccessInvestigationsCenter(): boolean {
  return isAdminUser();
}

export function canViewInvestigation(_investigation: Investigation | null | undefined): boolean {
  return isAdminUser();
}

export function canManageInvestigations(): boolean {
  return isAdminUser();
}

export function canDeleteInvestigation(): boolean {
  return isAdminUser();
}

export async function resolveInvestigatorEmail(): Promise<string> {
  return INVESTIGATION_INVESTIGATOR_EMAIL;
}

export function resolveInvestigatorDisplayName(): string {
  return INVESTIGATION_INVESTIGATOR_NAME;
}
