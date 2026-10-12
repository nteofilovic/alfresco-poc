package ch.dmspoc.api.dto;

import java.util.List;

/**
 * A daily task as the front end sees it. {@code id} is the id of the underlying Alfresco workflow
 * process (stable for the whole life of the task); {@code status} is new, in_progress, on_hold or done.
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
        boolean resolved
) {

    public record Attachment(String id, String name) {
    }
}
