package ch.dmspoc.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/** Self-service profile update; the person being updated is always the logged-in user. */
public record UpdateProfileRequest(
        @NotBlank String firstName,
        String lastName,
        @NotBlank @Email String email
) {
}
