package ch.dmspoc.api.controller;

import ch.dmspoc.api.dto.FolderTemplateDto;
import ch.dmspoc.api.dto.FolderTemplateRequest;
import ch.dmspoc.api.service.FolderTemplateService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Folder templates. Any logged-in user can list them (to create a Client, Property... in a space);
 * managing them is admin only ({@link ch.dmspoc.api.config.AdminInterceptor} guards /api/admin/**).
 */
@RestController
public class FolderTemplateController {

    private final FolderTemplateService templates;

    public FolderTemplateController(FolderTemplateService templates) {
        this.templates = templates;
    }

    @GetMapping("/api/folder-templates")
    public List<FolderTemplateDto> list() {
        return templates.list();
    }

    @PostMapping("/api/admin/folder-templates")
    @ResponseStatus(HttpStatus.CREATED)
    public FolderTemplateDto create(@Valid @RequestBody FolderTemplateRequest request) {
        return templates.create(request);
    }

    @PutMapping("/api/admin/folder-templates/{id}")
    public FolderTemplateDto update(@PathVariable String id, @Valid @RequestBody FolderTemplateRequest request) {
        return templates.update(id, request);
    }

    @DeleteMapping("/api/admin/folder-templates/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String id) {
        templates.delete(id);
    }
}
