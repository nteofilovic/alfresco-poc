package ch.dmspoc.api.dto;

/** One message in a task's conversation; {@code author} is a username, {@code createdAt} an ISO-8601 instant. */
public record TaskMessageDto(String id, String author, String text, String createdAt) {
}
