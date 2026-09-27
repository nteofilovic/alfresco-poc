package ch.dmspoc.api.dto;

public record SiteDto(
        String id,
        String title,
        String description,
        String visibility,
        String guid // the Document Library folder's node id, once resolved
) {
}
