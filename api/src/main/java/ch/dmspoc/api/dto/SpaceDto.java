package ch.dmspoc.api.dto;

/**
 * A Space: one business area of the company, backed by an Alfresco Share site. {@code rootId} is the
 * node id of the site's document library; {@code role} is the caller's site role (null for admins
 * who are not members).
 */
public record SpaceDto(
        String id,
        String title,
        String description,
        String visibility,
        String role,
        String rootId
) {
}
