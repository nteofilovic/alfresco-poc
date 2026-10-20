package ch.dmspoc.api.dto;

import java.util.List;

/**
 * A daily task as the front end sees it. {@code id} is the id of the underlying Alfresco workflow
 * process (stable for the whole life of the task); {@code status} is new, in_progress, on_hold, cancelled or done.
 * {@code siteId}/{@code siteTitle} name the space the task belongs to (null when unknown).
 */
public record TaskDto(
        String id,
        String title,
        String description,
        String createdAt,
        String dueDate,
        String creator,
        String assignee,
        String status,
        String message,
        List<Attachment> attachments,
        boolean resolved,
        String siteId,
        String siteTitle
) {

    /** {@code accessible} is false when the viewing user has no permission on the document (Alfresco ACL). */
    public record Attachment(String id, String name, boolean accessible) {
    }
}
