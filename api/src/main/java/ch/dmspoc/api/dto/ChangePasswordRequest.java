package ch.dmspoc.api.dto;

import jakarta.validation.constraints.NotBlank;

/** Self-service password change; no minimum length, consistent with user creation. */
public record ChangePasswordRequest(
        @NotBlank String currentPassword,
        @NotBlank String newPassword
) {
}
