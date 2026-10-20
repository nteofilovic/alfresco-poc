package ch.dmspoc.api.dto;

/** Optional closing message when the assignee resolves a task; {@code cancelled} closes it as cancelled instead of done. */
public record ResolveTaskRequest(String message, Boolean cancelled) {
}
