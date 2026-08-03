export function addedActionDestination(planStatus: string) {
  if (planStatus === "proposed") {
    return "/today/plan";
  }

  if (planStatus === "active") {
    return "/today/active";
  }

  return "/today";
}
