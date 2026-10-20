package ch.dmspoc.api.dto;

/** Assignee's update of a task: status (new, in_progress, on_hold, cancelled) and/or message; both optional. */
public record UpdateTaskRequest(String status, String message) {
}
