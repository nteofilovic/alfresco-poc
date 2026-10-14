package ch.dmspoc.api.controller;

import ch.dmspoc.api.dto.CreateSpaceRequest;
import ch.dmspoc.api.dto.SpaceDto;
import ch.dmspoc.api.dto.SpaceMemberDto;
import ch.dmspoc.api.service.SpaceService;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Spaces (Share sites). {@code GET /api/spaces} is for any logged-in user and returns only the
 * spaces they are a member of; everything under {@code /api/admin/spaces} is admin only
 * ({@link ch.dmspoc.api.config.AdminInterceptor}).
 */
@RestController
public class SpaceController {

    public record MemberRequest(@NotBlank String username, @NotBlank String role) {
    }

    private final SpaceService spaces;

    public SpaceController(SpaceService spaces) {
        this.spaces = spaces;
    }

    @GetMapping("/api/spaces")
    public List<SpaceDto> list(HttpSession session) {
        return spaces.list(Boolean.TRUE.equals(session.getAttribute(AuthController.SESSION_ADMIN_ATTR)));
    }

    @PostMapping("/api/admin/spaces")
    @ResponseStatus(HttpStatus.CREATED)
    public SpaceDto create(@Valid @RequestBody CreateSpaceRequest request) {
        return spaces.create(request);
    }

    @DeleteMapping("/api/admin/spaces/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String id) {
        spaces.delete(id);
    }

    @GetMapping("/api/admin/spaces/{id}/members")
    public List<SpaceMemberDto> members(@PathVariable String id) {
        return spaces.members(id);
    }

    @PostMapping("/api/admin/spaces/{id}/members")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void addMember(@PathVariable String id, @Valid @RequestBody MemberRequest request) {
        spaces.addMember(id, request.username().trim(), request.role());
    }

    @DeleteMapping("/api/admin/spaces/{id}/members/{username}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeMember(@PathVariable String id, @PathVariable String username) {
        spaces.removeMember(id, username);
    }
}
