import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../services/accessScopes', () => ({canAccessHrNotes: vi.fn(()=>false)}));
vi.mock('../services/access', () => ({
  isAdminUser:()=>true,isSupervisorUser:()=>false,employeeMatchesSupervisorAccess:()=>false,
  canQueryDisciplineReports:()=>false,canAccessDisciplineForEmployee:()=>false,
}));
vi.mock('../services/supabaseClient',()=>({supabaseClient:{from:vi.fn()}}));
vi.mock('../services/employeeUtils',()=>({employeeDisplayName:()=> 'Test employee'}));
vi.mock('../utils/helpers',()=>({esc:(text:unknown)=>String(text)}));
vi.mock('../modules/employeeDrawerTabLoads',()=>({isCurrentDrawerEmployee:()=>true}));
import {canAccessHrNotes} from '../services/accessScopes';
import {supabaseClient} from '../services/supabaseClient';
import {fetchMobileActivityFeed} from '../services/mobileActivityFeed';
import {loadEmployeeHistory} from '../ui/history';
const target={innerHTML:''};
beforeEach(()=>{
  vi.mocked(canAccessHrNotes).mockReturnValue(false);
  vi.mocked(supabaseClient.from).mockReset().mockImplementation((table:string)=>{
    const result={data: table==='employee_notes' ? [
      {id:1,employee_id:'team',note_type:'General',note_text:'private meeting',note_date:'2026-10-14'},
      {id:2,employee_id:'team',note_type:'At-Risk Flag',note_text:'shared flag',note_date:'2026-10-14'},
    ] : [],error:null};
    const chain={select:()=>chain,eq:()=>chain,order:()=>chain,limit:()=>Promise.resolve(result),
      then: (resolve:(value:typeof result)=>unknown)=>Promise.resolve(result).then(resolve)};
    return chain as never;
  });
  vi.stubGlobal('document',{getElementById:()=>target});
  window.currentEmployee={id:'team'} as never;
  target.innerHTML='';
});
describe('private HR notes in secondary views',()=>{
  it('never requests notes for another admin’s activity or employee timeline',async()=>{
    expect(await fetchMobileActivityFeed()).toEqual([]);
    await loadEmployeeHistory('team');
    expect(vi.mocked(supabaseClient.from).mock.calls.flat()).not.toContain('employee_notes');
    expect(target.innerHTML).not.toContain('private meeting');
  });
  it('shows Matthew’s private notes but excludes operational flags',async()=>{
    vi.mocked(canAccessHrNotes).mockReturnValue(true);
    const items=await fetchMobileActivityFeed();
    expect(items.map(item=>item.detail)).toEqual(['private meeting']);
    await loadEmployeeHistory('team');
    expect(target.innerHTML).toContain('private meeting');
    expect(target.innerHTML).not.toContain('shared flag');
  });
});
