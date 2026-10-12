package ch.dmspoc.api.dto;

/** "Task done" notice for the creator; {@code id} is what to pass to the dismiss endpoint. */
public record TaskNotificationDto(String id, String taskId, String title, String assignee, String resolvedAt) {
}
