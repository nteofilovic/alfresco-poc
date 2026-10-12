package ch.dmspoc.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/** Creates an Alfresco person (a Zapis user). */
public record CreateUserRequest(
        @NotBlank @Pattern(regexp = "[A-Za-z0-9._@-]+", message = "may only contain letters, digits and . _ @ -") String username,
        @NotBlank String firstName,
        String lastName,
        @NotBlank @Email String email,
        @NotBlank String password
) {
}
