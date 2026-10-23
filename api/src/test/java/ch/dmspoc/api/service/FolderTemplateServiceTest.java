package ch.dmspoc.api.service;

import ch.dmspoc.api.dto.FolderNode;
import ch.dmspoc.api.dto.FolderTemplateDto;
import ch.dmspoc.api.dto.FolderTemplateRequest;
import ch.dmspoc.api.exception.AlfrescoApiException;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FolderTemplateServiceTest {

    /** Keeps config files in memory instead of Alfresco. */
    static class InMemoryStore extends ConfigStore {
        final Map<String, byte[]> files = new HashMap<>();

        InMemoryStore() {
            super(null);
        }

        @Override
        public Optional<byte[]> read(String fileName) {
            return Optional.ofNullable(files.get(fileName));
        }

        @Override
        public void write(String fileName, byte[] json) {
            files.put(fileName, json);
        }
    }

    private final InMemoryStore store = new InMemoryStore();
    private final FolderTemplateService service = new FolderTemplateService(store, new ObjectMapper());

    @Test
    void startsEmpty() {
        assertTrue(service.list().isEmpty());
        assertEquals(Optional.empty(), service.find("nope"));
    }

    @Test
    void createStoresTheTemplateWithAGeneratedId() {
        FolderTemplateDto created = service.create(request("Client", "A customer", node("Contracts"), node("Invoices")));

        assertFalse(created.id().isBlank());
        assertEquals("Client", created.name());
        assertEquals("A customer", created.description());
        assertEquals(List.of("Contracts", "Invoices"), created.folders().stream().map(FolderNode::name).toList());
        assertEquals(List.of(created), service.list());
        assertEquals(created, service.find(created.id()).orElseThrow());
    }

    @Test
    void everyTemplateGetsItsOwnId() {
        FolderTemplateDto a = service.create(request("A", null));
        FolderTemplateDto b = service.create(request("B", null));

        assertNotEquals(a.id(), b.id());
        assertEquals(2, service.list().size());
    }

    @Test
    void templatesSurviveAReload() {
        FolderTemplateDto created = service.create(request("Client", null, node("Contracts", node("2026"))));

        FolderTemplateService reloaded = new FolderTemplateService(store, new ObjectMapper());
        assertEquals(List.of(created), reloaded.list());
    }

    @Test
    void namesAndDescriptionAreTrimmed() {
        FolderTemplateDto created = service.create(request("  Client  ", "  text  ", node("  Contracts  ")));

        assertEquals("Client", created.name());
        assertEquals("text", created.description());
        assertEquals("Contracts", created.folders().getFirst().name());
    }

    @Test
    void aMissingDescriptionBecomesEmpty() {
        assertEquals("", service.create(request("Client", null)).description());
    }

    @Test
    void missingFoldersBecomeAnEmptyList() {
        FolderTemplateDto created = service.create(new FolderTemplateRequest("Client", null, null));

        assertEquals(List.of(), created.folders());
    }

    @Test
    void childrenAreNormalizedAtEveryLevel() {
        FolderTemplateDto created = service.create(new FolderTemplateRequest("Client", null,
                List.of(new FolderNode(" A ", List.of(new FolderNode(" B ", null))))));

        FolderNode a = created.folders().getFirst();
        assertEquals("A", a.name());
        assertEquals("B", a.children().getFirst().name());
        assertEquals(List.of(), a.children().getFirst().children());
    }

    @Test
    void duplicateTemplateNamesAreRefusedIgnoringCaseAndSpaces() {
        service.create(request("Client", null));

        assertEquals(409, assertThrows(AlfrescoApiException.class, () -> service.create(request("client", null))).getStatus());
        assertEquals(409, assertThrows(AlfrescoApiException.class, () -> service.create(request("  CLIENT ", null))).getStatus());
        assertEquals(1, service.list().size());
    }

    @Test
    void duplicateSiblingFoldersAreRefusedIgnoringCase() {
        var e = assertThrows(AlfrescoApiException.class, () -> service.create(request("Client", null, node("Docs"), node("docs"))));

        assertEquals(400, e.getStatus());
        assertTrue(service.list().isEmpty(), "nothing is stored after a refused create");
    }

    @Test
    void duplicateSiblingFoldersAreRefusedWhenTheyDifferOnlyBySpaces() {
        var e = assertThrows(AlfrescoApiException.class, () -> service.create(request("Client", null, node("Docs"), node(" Docs "))));

        assertEquals(400, e.getStatus());
    }

    @Test
    void duplicateSiblingFoldersAreRefusedAtDeeperLevels() {
        var e = assertThrows(AlfrescoApiException.class,
                () -> service.create(request("Client", null, node("Docs", node("2026"), node("2026")))));

        assertEquals(400, e.getStatus());
    }

    @Test
    void theSameFolderNameInDifferentBranchesIsFine() {
        FolderTemplateDto created = service.create(request("Client", null,
                node("Contracts", node("2026")), node("Invoices", node("2026"))));

        assertEquals(2, created.folders().size());
    }

    // ----------------------------------------------------------------- update

    @Test
    void updateReplacesTheTemplateAndKeepsItsId() {
        FolderTemplateDto created = service.create(request("Client", "old", node("Docs")));

        FolderTemplateDto updated = service.update(created.id(), request("Customer", "new", node("Files")));

        assertEquals(created.id(), updated.id());
        assertEquals("Customer", updated.name());
        assertEquals("new", updated.description());
        assertEquals(List.of(updated), service.list());
    }

    @Test
    void updateKeepsTheOtherTemplatesAndTheirOrder() {
        FolderTemplateDto a = service.create(request("A", null));
        FolderTemplateDto b = service.create(request("B", null));
        FolderTemplateDto c = service.create(request("C", null));

        FolderTemplateDto updated = service.update(b.id(), request("B2", null));

        assertEquals(List.of(a, updated, c), service.list());
    }

    @Test
    void aTemplateMayBeSavedUnderItsOwnNameAgain() {
        FolderTemplateDto created = service.create(request("Client", null));

        FolderTemplateDto updated = service.update(created.id(), request("client", "now with text"));

        assertEquals("client", updated.name());
    }

    @Test
    void updateCannotTakeAnotherTemplatesName() {
        service.create(request("Client", null));
        FolderTemplateDto owner = service.create(request("Owner", null));

        var e = assertThrows(AlfrescoApiException.class, () -> service.update(owner.id(), request("CLIENT", null)));

        assertEquals(409, e.getStatus());
        assertEquals("Owner", service.find(owner.id()).orElseThrow().name());
    }

    @Test
    void updateOfAnUnknownTemplateIsNotFound() {
        var e = assertThrows(AlfrescoApiException.class, () -> service.update("missing", request("Client", null)));

        assertEquals(404, e.getStatus());
        assertTrue(service.list().isEmpty());
    }

    @Test
    void updateWithDuplicateSiblingsIsRefusedAndChangesNothing() {
        FolderTemplateDto created = service.create(request("Client", null, node("Docs")));

        var e = assertThrows(AlfrescoApiException.class,
                () -> service.update(created.id(), request("Client", null, node("A"), node("a"))));

        assertEquals(400, e.getStatus());
        assertEquals(created, service.find(created.id()).orElseThrow());
    }

    // ------------------------------------------------------------------ delete

    @Test
    void deleteRemovesOnlyThatTemplate() {
        FolderTemplateDto a = service.create(request("A", null));
        FolderTemplateDto b = service.create(request("B", null));

        service.delete(a.id());

        assertEquals(List.of(b), service.list());
        assertEquals(Optional.empty(), service.find(a.id()));
    }

    @Test
    void deleteOfAnUnknownTemplateIsNotFound() {
        service.create(request("A", null));

        assertEquals(404, assertThrows(AlfrescoApiException.class, () -> service.delete("missing")).getStatus());
        assertEquals(1, service.list().size());
    }

    @Test
    void aDeletedNameCanBeUsedAgain() {
        FolderTemplateDto a = service.create(request("A", null));
        service.delete(a.id());

        assertEquals("A", service.create(request("A", null)).name());
    }

    // ----------------------------------------------------------------- helpers

    private static FolderTemplateRequest request(String name, String description, FolderNode... folders) {
        return new FolderTemplateRequest(name, description, List.of(folders));
    }

    private static FolderNode node(String name, FolderNode... children) {
        return new FolderNode(name, List.of(children));
    }
}
