package ch.dmspoc.api.service;

import ch.dmspoc.api.dto.CreateSpaceRequest;
import ch.dmspoc.api.dto.SpaceDto;
import ch.dmspoc.api.dto.SpaceMemberDto;
import ch.dmspoc.api.exception.AlfrescoApiException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Spaces: the business areas of a company (Clients, Suppliers, Finance...), each one an Alfresco Share
 * site. Who sees which space is decided by Alfresco site membership; this class lists what the
 * calling user can reach (their own ticket) and lets admins create spaces and manage members
 * (service account). A new space starts empty: members fill it by creating folders from the
 * admin-designed folder templates (see FolderTemplateService).
 */
@Service
public class SpaceService {

    /** cm:description value on the fixed subfolders of a folder template; members can't rename or delete them. */
    public static final String STRUCTURE_MARK = "zapis-structure";

    private static final Set<String> ROLES = Set.of("SiteManager", "SiteCollaborator", "SiteContributor", "SiteConsumer");
    private static final Set<String> VISIBILITIES = Set.of("PRIVATE", "MODERATED", "PUBLIC");

    private final AlfrescoClient user;
    private final AlfrescoClient service;

    public SpaceService(AlfrescoClient user, @Qualifier("serviceAlfrescoClient") AlfrescoClient service) {
        this.user = user;
        this.service = service;
    }

    // ---------------------------------------------------------------- queries

    /** Spaces the user belongs to; admins see every space. */
    public List<SpaceDto> list(boolean isAdmin) {
        AlfrescoClient client = isAdmin ? service : user;
        JsonNode entries = (isAdmin ? service.listSites(0, 1000) : user.listMySites(1000)).path("list").path("entries");
        List<SpaceDto> spaces = new ArrayList<>();
        for (JsonNode item : entries) {
            JsonNode entry = item.path("entry");
            JsonNode site = isAdmin ? entry : entry.path("site");
            String id = site.path("id").asText();
            String root = rootId(client, id);
            if (root == null) continue; // not a document-library site (e.g. a bare Share dashboard site)
            spaces.add(new SpaceDto(id, site.path("title").asText(id), site.path("description").asText(""),
                    site.path("visibility").asText(""), isAdmin ? null : entry.path("role").asText(null), root));
        }
        spaces.sort((a, b) -> a.title().compareToIgnoreCase(b.title()));
        return spaces;
    }

    /** Site id to title for every site; used to label tasks. */
    public Map<String, String> titles() {
        Map<String, String> titles = new HashMap<>();
        for (JsonNode item : service.listSites(0, 1000).path("list").path("entries")) {
            JsonNode site = item.path("entry");
            titles.put(site.path("id").asText(), site.path("title").asText());
        }
        return titles;
    }

    public List<SpaceMemberDto> members(String siteId) {
        List<SpaceMemberDto> members = new ArrayList<>();
        for (JsonNode item : service.listSiteMembers(siteId).path("list").path("entries")) {
            JsonNode entry = item.path("entry");
            JsonNode person = entry.path("person");
            String name = (person.path("firstName").asText("") + " " + person.path("lastName").asText("")).trim();
            String username = entry.path("id").asText(person.path("id").asText());
            members.add(new SpaceMemberDto(username, name.isEmpty() ? username : name, entry.path("role").asText()));
        }
        return members;
    }

    // --------------------------------------------------------------- commands

    /** Creates the site and the folder tree under its document library; rolls the site back on failure. */
    public SpaceDto create(CreateSpaceRequest request) {
        String title = request.title().trim();
        String id = request.id() == null || request.id().isBlank() ? slug(title) : request.id().trim();
        if (!id.matches("[a-zA-Z0-9-]+")) {
            throw new AlfrescoApiException(400, "Space id may only contain letters, digits and hyphens");
        }
        String visibility = request.visibility() == null || request.visibility().isBlank()
                ? "PRIVATE" : request.visibility().trim().toUpperCase(Locale.ROOT);
        if (!VISIBILITIES.contains(visibility)) {
            throw new AlfrescoApiException(400, "visibility must be PRIVATE, MODERATED or PUBLIC");
        }

        service.createSite(id, title, request.description(), visibility);
        String root = rootId(service, id);
        if (root == null) {
            try {
                service.deleteSite(id);
            } catch (RuntimeException ignored) {
                // best effort; the missing library is the useful error
            }
            throw new AlfrescoApiException(502, "The new space has no document library");
        }
        return new SpaceDto(id, title, request.description() == null ? "" : request.description(), visibility, null, root);
    }

    public void delete(String siteId) {
        service.deleteSite(siteId);
    }

    public void addMember(String siteId, String username, String role) {
        assertRole(role);
        try {
            service.addSiteMember(siteId, username, role);
        } catch (AlfrescoApiException e) {
            if (e.getStatus() == 409) { // already a member: change the role instead
                service.updateSiteMember(siteId, username, role);
                return;
            }
            throw e;
        }
    }

    public void removeMember(String siteId, String username) {
        service.removeSiteMember(siteId, username);
    }

    // ---------------------------------------------------------------- helpers

    /** Document library node id of a site, or null when the site has none. */
    private static String rootId(AlfrescoClient client, String siteId) {
        try {
            String id = client.getSiteContainer(siteId, "documentLibrary").path("entry").path("id").asText("");
            return id.isEmpty() ? null : id;
        } catch (AlfrescoApiException e) {
            if (e.getStatus() == 404 || e.getStatus() == 403) return null;
            throw e;
        }
    }

    private static void assertRole(String role) {
        if (!ROLES.contains(role)) {
            throw new AlfrescoApiException(400, "role must be one of " + String.join(", ", ROLES));
        }
    }

    private static String slug(String title) {
        String ascii = Normalizer.normalize(title, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        String slug = ascii.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("^-+|-+$", "");
        if (slug.isEmpty()) throw new AlfrescoApiException(400, "Cannot derive a space id from the title; provide one");
        return slug;
    }
}
