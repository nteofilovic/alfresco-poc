package ch.dmspoc.api.dto;

/** A member of a Space; {@code role} is SiteManager, SiteCollaborator, SiteContributor or SiteConsumer. */
public record SpaceMemberDto(String username, String displayName, String role) {
}
