package ch.dmspoc.api.controller;

import ch.dmspoc.api.dto.FolderNode;
import ch.dmspoc.api.service.WorkspaceService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
public class WorkspaceController {

    public record CreateWorkspaceRequest(@NotEmpty @Valid List<@Valid FolderNode> folders) {
    }

    private final WorkspaceService workspaceService;

    public WorkspaceController(WorkspaceService workspaceService) {
        this.workspaceService = workspaceService;
    }

    /** Any logged-in user: where the workspace's folder tree starts, or {@code exists:false} before setup. */
    @GetMapping("/api/workspace")
    public Map<String, Object> get() {
        Map<String, Object> result = new HashMap<>();
        var root = workspaceService.rootId();
        result.put("exists", root.isPresent());
        result.put("name", WorkspaceService.TITLE);
        result.put("rootId", root.orElse(null));
        return result;
    }

    @PostMapping("/api/admin/workspace")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> create(@Valid @RequestBody CreateWorkspaceRequest request) {
        String rootId = workspaceService.create(request.folders());
        Map<String, Object> result = new HashMap<>();
        result.put("exists", true);
        result.put("name", WorkspaceService.TITLE);
        result.put("rootId", rootId);
        return result;
    }
}
