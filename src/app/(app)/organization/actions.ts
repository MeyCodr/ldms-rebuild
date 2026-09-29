"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { assignHeadSchema, departmentSchema, divisionSchema, sectionSchema, transferSchema } from "@/lib/validation/org";
import { parseForm, toErrorState } from "@/server/errors";
import { requireUser } from "@/server/session";
import * as org from "@/server/services/org";

const done = (message: string): ActionState => {
  // "layout" also refreshes the department pages under /organization.
  revalidatePath("/organization", "layout");
  revalidatePath("/staff");
  revalidatePath("/");
  return { status: "ok", message };
};

export async function createDivisionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let id: number;
  try {
    const input = parseForm(divisionSchema, { name: fd.get("name"), shortName: fd.get("shortName") ?? "" });
    id = (await org.createDivision(user, input)).id;
  } catch (e) {
    return toErrorState(e);
  }
  done("");
  redirect(`/organization#division-${id}`);
}

export async function updateDivisionAction(id: number, _p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    await org.updateDivision(user, id, parseForm(divisionSchema, { name: fd.get("name"), shortName: fd.get("shortName") ?? "" }));
    return done("Division updated.");
  } catch (e) {
    return toErrorState(e);
  }
}

export async function setDivisionHeadAction(id: number, _p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const { staffId } = parseForm(assignHeadSchema, { staffId: fd.get("staffId") ?? "" });
    await org.setDivisionHead(user, id, staffId);
    return done(staffId ? "Division head updated." : "Division head removed.");
  } catch (e) {
    return toErrorState(e);
  }
}

export async function deleteDivisionAction(id: number, _p: ActionState): Promise<ActionState> {
  const user = await requireUser();
  try {
    await org.deleteDivision(user, id);
  } catch (e) {
    return toErrorState(e);
  }
  done("");
  redirect("/organization");
}

export async function createDepartmentAction(divisionId: number, _p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let id: number;
  try {
    const input = parseForm(departmentSchema, { name: fd.get("name"), shortName: fd.get("shortName") ?? "", divisionId });
    id = (await org.createDepartment(user, input)).id;
  } catch (e) {
    return toErrorState(e);
  }
  done("");
  redirect(`/organization/departments/${id}`);
}

export async function updateDepartmentAction(id: number, _p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const input = parseForm(departmentSchema, { name: fd.get("name"), shortName: fd.get("shortName") ?? "", divisionId: fd.get("divisionId") });
    await org.updateDepartment(user, id, input);
    return done("Department updated.");
  } catch (e) {
    return toErrorState(e);
  }
}

export async function setHodAction(id: number, _p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const { staffId } = parseForm(assignHeadSchema, { staffId: fd.get("staffId") ?? "" });
    await org.setDepartmentHod(user, id, staffId);
    return done(staffId ? "HOD updated. Approvals for this department now go to the new HOD." : "HOD removed.");
  } catch (e) {
    return toErrorState(e);
  }
}

export async function deleteDepartmentAction(id: number, divisionId: number, _p: ActionState): Promise<ActionState> {
  const user = await requireUser();
  try {
    await org.deleteDepartment(user, id);
  } catch (e) {
    return toErrorState(e);
  }
  done("");
  redirect(`/organization#division-${divisionId}`);
}

export async function createSectionAction(departmentId: number, _p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    await org.createSection(user, parseForm(sectionSchema, { name: fd.get("name"), departmentId }));
    return done("Section added.");
  } catch (e) {
    return toErrorState(e);
  }
}

export async function renameSectionAction(id: number, departmentId: number, _p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const { name } = parseForm(sectionSchema, { name: fd.get("name"), departmentId });
    await org.renameSection(user, id, name);
    return done("Section renamed.");
  } catch (e) {
    return toErrorState(e);
  }
}

export async function deleteSectionAction(id: number, _p: ActionState): Promise<ActionState> {
  const user = await requireUser();
  try {
    await org.deleteSection(user, id);
    return done("Section deleted.");
  } catch (e) {
    return toErrorState(e);
  }
}

export async function transferAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const input = parseForm(transferSchema, {
      staffIds: fd.getAll("staffIds"),
      departmentId: fd.get("departmentId"),
      sectionId: fd.get("sectionId") ?? "",
    });
    const { moved, hodsCleared } = await org.transferStaff(user, input);
    return done(`Transferred ${moved} staff.${hodsCleared.length ? ` ${hodsCleared.join(", ")} no longer ${hodsCleared.length === 1 ? "has" : "have"} a HOD.` : ""}`);
  } catch (e) {
    return toErrorState(e);
  }
}
