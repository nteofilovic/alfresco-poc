package ch.dmspoc.api.dto;

import java.util.List;

/**
 * A folder template an admin designed (e.g. "Client", "Property"): when a member creates one, a folder
 * with the member's chosen name appears in the current folder, holding {@code folders} as fixed subfolders.
 */
public record FolderTemplateDto(
        String id,
        String name,
        String description,
        List<FolderNode> folders
) {
}
