package ch.dmspoc.api.dto;

/** The logged-in user's own layout; null (or blank) means "use the application default". */
public record UserStyleRequest(String style) {
}
