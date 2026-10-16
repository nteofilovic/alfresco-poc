package ch.dmspoc.api.controller;

import ch.dmspoc.api.dto.AssigneeDto;
import ch.dmspoc.api.dto.CreateTaskRequest;
import ch.dmspoc.api.dto.ResolveTaskRequest;
import ch.dmspoc.api.dto.TaskDto;
import ch.dmspoc.api.dto.TaskNotificationDto;
import ch.dmspoc.api.dto.UpdateTaskRequest;
import ch.dmspoc.api.exception.AlfrescoApiException;
import ch.dmspoc.api.service.TaskService;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Daily task list. The acting user always comes from the HTTP session, never from the request;
 * /api/** is guarded by {@link ch.dmspoc.api.config.AuthInterceptor}. Who may see or act on a task is
 * enforced by {@link TaskService}; access to a task's documents is decided by Alfresco's ACLs.
 */
@RestController
@RequestMapping("/api/tasks")
public class TaskController {

    private final TaskService tasks;

    public TaskController(TaskService tasks) {
        this.tasks = tasks;
    }

    @GetMapping
    public List<TaskDto> list(@RequestParam(defaultValue = "assigned") String scope, HttpSession session) {
        if (!scope.equals("assigned") && !scope.equals("created")) {
            throw new AlfrescoApiException(400, "scope must be assigned or created");
        }
        return tasks.list(currentUser(session), scope.equals("created"));
    }

    @GetMapping("/assignees")
    public List<AssigneeDto> assignees() {
        return tasks.assignees();
    }

    @GetMapping("/notifications")
    public List<TaskNotificationDto> notifications(HttpSession session) {
        return tasks.notifications(currentUser(session));
    }

    @PostMapping("/notifications/{id}/dismiss")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void dismiss(@PathVariable String id, HttpSession session) {
        tasks.dismissNotification(id, currentUser(session));
    }

    @GetMapping("/{id}")
    public TaskDto get(@PathVariable String id, HttpSession session) {
        return tasks.get(id, currentUser(session));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TaskDto create(@Valid @RequestBody CreateTaskRequest request, HttpSession session) {
        return tasks.create(request, currentUser(session));
    }

    @PutMapping("/{id}")
    public TaskDto update(@PathVariable String id, @RequestBody UpdateTaskRequest request, HttpSession session) {
        return tasks.update(id, currentUser(session), request.status(), request.message());
    }

    @PostMapping("/{id}/resolve")
    public TaskDto resolve(@PathVariable String id, @RequestBody(required = false) ResolveTaskRequest request, HttpSession session) {
        return tasks.resolve(id, currentUser(session), request == null ? null : request.message());
    }

    private static String currentUser(HttpSession session) {
        return (String) session.getAttribute(AuthController.SESSION_USER_ATTR);
    }
}
