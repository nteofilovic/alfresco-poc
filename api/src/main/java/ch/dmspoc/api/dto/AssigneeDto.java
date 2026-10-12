package ch.dmspoc.api.dto;

/** A user a task can be assigned to. */
public record AssigneeDto(String username, String displayName) {
}
