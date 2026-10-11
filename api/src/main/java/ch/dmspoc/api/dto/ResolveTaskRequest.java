package ch.dmspoc.api.dto;

/** Optional closing message when the assignee resolves a task. */
public record ResolveTaskRequest(String message) {
}
