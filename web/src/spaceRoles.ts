const ROLE_LABEL: Record<string, string> = {
  SiteManager: 'Manager',
  SiteCollaborator: 'Collaborator',
  SiteContributor: 'Contributor',
  SiteConsumer: 'Viewer',
}

/** A site role as members see it; admins who are not members have no role. */
export function roleLabel(role: string | null): string {
  return role ? (ROLE_LABEL[role] ?? role) : 'Administrator'
}
