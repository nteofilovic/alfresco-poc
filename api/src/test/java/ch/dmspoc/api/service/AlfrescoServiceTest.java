package ch.dmspoc.api.service;

import ch.dmspoc.api.dto.FolderNode;
import ch.dmspoc.api.dto.FolderTemplateDto;
import ch.dmspoc.api.dto.NodeDto;
import ch.dmspoc.api.dto.NodePage;
import ch.dmspoc.api.dto.StickyNote;
import ch.dmspoc.api.exception.AlfrescoApiException;
import ch.dmspoc.api.exception.RequestRejectedException;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** Mapping and business rules of {@link AlfrescoService}; every collaborator but the merge engine is mocked. */
class AlfrescoServiceTest {

    private final ObjectMapper mapper = JsonMapper.builder().build();
    private AlfrescoClient client;
    private DocumentMergeService merge;
    private FolderTemplateService templates;
    private PdfAnnotationService pdfAnnotations;
    private AnnotationStore annotations;
    private AlfrescoService service;

    @BeforeEach
    void setUp() {
        client = mock(AlfrescoClient.class);
        merge = mock(DocumentMergeService.class);
        templates = mock(FolderTemplateService.class);
        pdfAnnotations = mock(PdfAnnotationService.class);
        annotations = mock(AnnotationStore.class);
        service = new AlfrescoService(client, mapper, merge, templates, pdfAnnotations, annotations);
    }

    // ---------------------------------------------------------------- mapping

    @Test
    void getNodeMapsEveryField() {
        when(client.getNode("n1", "properties,aspectNames,path")).thenReturn(json("""
                {"entry":{"id":"n1","name":"a.pdf","isFolder":false,"isFile":true,"nodeType":"cm:content",
                  "content":{"mimeType":"application/pdf","sizeInBytes":1234},
                  "createdAt":"2026-09-27T14:23:52.862+0000","modifiedAt":"2026-09-28T08:00:00.000+0200",
                  "createdByUser":{"id":"anna","displayName":"Anna Meier"},
                  "aspectNames":["cm:titled","cm:auditable"],
                  "properties":{"cm:title":"Quarterly","cm:versionLabel":"1.2"},
                  "path":{"elements":[{"id":"r","name":"Company Home"},{"id":"s","name":"Sites"}]}}}"""));

        NodeDto node = service.getNode("n1");

        assertEquals("n1", node.id());
        assertEquals("a.pdf", node.name());
        assertTrue(node.isFile());
        assertFalse(node.isFolder());
        assertEquals("cm:content", node.nodeType());
        assertEquals("application/pdf", node.mimeType());
        assertEquals(1234L, node.sizeInBytes());
        assertEquals(OffsetDateTime.of(2026, 9, 27, 14, 23, 52, 862_000_000, ZoneOffset.UTC), node.createdAt());
        assertEquals(OffsetDateTime.of(2026, 9, 28, 8, 0, 0, 0, ZoneOffset.ofHours(2)), node.modifiedAt());
        assertEquals("Anna Meier", node.createdByUser());
        assertEquals(List.of("cm:titled", "cm:auditable"), node.aspectNames());
        assertEquals("Quarterly", node.properties().get("cm:title"));
        assertEquals(List.of(new NodeDto.PathElement("r", "Company Home"), new NodeDto.PathElement("s", "Sites")), node.ancestors());
        assertFalse(node.hasAnnotations());
    }

    @Test
    void aSparseNodeGetsSafeDefaults() {
        when(client.getNode(eq("n1"), any())).thenReturn(json("{\"entry\":{\"id\":\"n1\",\"name\":\"folder\",\"isFolder\":true}}"));

        NodeDto node = service.getNode("n1");

        assertTrue(node.isFolder());
        assertFalse(node.isFile());
        assertNull(node.mimeType());
        assertNull(node.sizeInBytes());
        assertNull(node.createdAt());
        assertNull(node.modifiedAt());
        assertNull(node.createdByUser());
        assertEquals(List.of(), node.aspectNames());
        assertEquals(Map.of(), node.properties());
        assertEquals(List.of(), node.ancestors());
    }

    @Test
    void anEmptyFileHasASizeOfZeroNotNull() {
        when(client.getNode(eq("n1"), any())).thenReturn(json("{\"entry\":{\"id\":\"n1\",\"content\":{\"sizeInBytes\":0}}}"));

        assertEquals(0L, service.getNode("n1").sizeInBytes());
    }

    @Test
    void aMalformedDateIsNotSwallowed() {
        when(client.getNode(eq("n1"), any())).thenReturn(json("{\"entry\":{\"id\":\"n1\",\"createdAt\":\"yesterday\"}}"));

        assertThrows(RuntimeException.class, () -> service.getNode("n1"));
    }

    // ---------------------------------------------------------------- listing

    @Test
    void listChildrenMapsEveryEntry() {
        when(client.listChildren("p", null, 0, 50)).thenReturn(listing("{\"id\":\"a\",\"name\":\"A\"}", "{\"id\":\"b\",\"name\":\"B\"}"));

        assertEquals(List.of("a", "b"), service.listChildren("p", 0, 50).stream().map(NodeDto::id).toList());
    }

    @Test
    void listChildrenOfAnEmptyFolderIsEmpty() {
        when(client.listChildren("p", null, 0, 50)).thenReturn(listing());

        assertTrue(service.listChildren("p", 0, 50).isEmpty());
    }

    @Test
    void onlyPdfsWithAnnotationsAreFlagged() {
        when(client.listChildren("p", null, 0, 50)).thenReturn(listing(
                "{\"id\":\"a\",\"content\":{\"mimeType\":\"application/pdf\"}}",
                "{\"id\":\"b\",\"content\":{\"mimeType\":\"application/pdf\"}}",
                "{\"id\":\"c\",\"content\":{\"mimeType\":\"image/png\"}}"));
        when(annotations.annotatedIds()).thenReturn(Set.of("a", "c"));

        List<NodeDto> nodes = service.listChildren("p", 0, 50);

        assertTrue(nodes.get(0).hasAnnotations());
        assertFalse(nodes.get(1).hasAnnotations());
        assertTrue(nodes.get(2).hasAnnotations(), "the lookup is by id; only the PDF presence triggers it");
    }

    @Test
    void theAnnotationLookupIsSkippedWithoutPdfs() {
        when(client.listChildren("p", null, 0, 50)).thenReturn(listing("{\"id\":\"c\",\"content\":{\"mimeType\":\"image/png\"}}"));

        service.listChildren("p", 0, 50);

        verifyNoInteractions(annotations);
    }

    @Test
    void aFailingAnnotationLookupOnlyCostsTheFlag() {
        when(client.listChildren("p", null, 0, 50)).thenReturn(listing("{\"id\":\"a\",\"content\":{\"mimeType\":\"application/pdf\"}}"));
        when(annotations.annotatedIds()).thenThrow(new AlfrescoApiException(500, "down"));

        List<NodeDto> nodes = service.listChildren("p", 0, 50);

        assertEquals(1, nodes.size());
        assertFalse(nodes.getFirst().hasAnnotations());
    }

    @Test
    void noAnnotatedIdsLeavesTheListingUntouched() {
        when(client.listChildren("p", null, 0, 50)).thenReturn(listing("{\"id\":\"a\",\"content\":{\"mimeType\":\"application/pdf\"}}"));
        when(annotations.annotatedIds()).thenReturn(Set.of());

        assertFalse(service.listChildren("p", 0, 50).getFirst().hasAnnotations());
    }

    // ------------------------------------------------------------ paged listing

    @Test
    void theDefaultSortIsFoldersThenNameAscending() {
        when(client.listChildren(eq("p"), any(), anyInt(), anyInt(), anyString())).thenReturn(listing());

        service.listChildrenPage("p", 0, 20, "name", "asc");

        verify(client).listChildren("p", null, 0, 20, "isFolder DESC,name ASC");
    }

    @Test
    void otherSortFieldsAddNameAsTieBreaker() {
        when(client.listChildren(eq("p"), any(), anyInt(), anyInt(), anyString())).thenReturn(listing());

        service.listChildrenPage("p", 0, 20, "modifiedAt", "desc");
        service.listChildrenPage("p", 0, 20, "owner", "ASC");
        service.listChildrenPage("p", 0, 20, "sizeInBytes", "Desc");

        verify(client).listChildren("p", null, 0, 20, "isFolder DESC,modifiedAt DESC,name ASC");
        verify(client).listChildren("p", null, 0, 20, "isFolder DESC,createdByUser.id ASC,name ASC");
        verify(client).listChildren("p", null, 0, 20, "isFolder DESC,content.sizeInBytes DESC,name ASC");
    }

    @Test
    void anUnknownSortFieldIsABadRequest() {
        var e = assertThrows(AlfrescoApiException.class, () -> service.listChildrenPage("p", 0, 20, "color", "asc"));

        assertEquals(400, e.getStatus());
        verifyNoInteractions(client);
    }

    @Test
    void anUnknownSortDirectionIsABadRequest() {
        assertEquals(400, assertThrows(AlfrescoApiException.class, () -> service.listChildrenPage("p", 0, 20, "name", "up")).getStatus());
        assertEquals(400, assertThrows(AlfrescoApiException.class, () -> service.listChildrenPage("p", 0, 20, "name", null)).getStatus());
        verifyNoInteractions(client);
    }

    @Test
    void aNegativeSkipIsABadRequest() {
        assertEquals(400, assertThrows(AlfrescoApiException.class, () -> service.listChildrenPage("p", -1, 20, "name", "asc")).getStatus());
    }

    @Test
    void thePageSizeIsClampedBetweenOneAndAHundred() {
        when(client.listChildren(eq("p"), any(), anyInt(), anyInt(), anyString())).thenReturn(listing());

        assertEquals(1, service.listChildrenPage("p", 0, 0, "name", "asc").maxItems());
        assertEquals(1, service.listChildrenPage("p", 0, -5, "name", "asc").maxItems());
        assertEquals(100, service.listChildrenPage("p", 0, 100, "name", "asc").maxItems());
        assertEquals(100, service.listChildrenPage("p", 0, 5000, "name", "asc").maxItems());
    }

    @Test
    void thePageCarriesAlfrescosPaginationInfo() {
        when(client.listChildren(eq("p"), any(), anyInt(), anyInt(), anyString())).thenReturn(json("""
                {"list":{"entries":[{"entry":{"id":"a"}}],"pagination":{"totalItems":42,"hasMoreItems":true}}}"""));

        NodePage page = service.listChildrenPage("p", 20, 20, "name", "asc");

        assertEquals(42, page.totalItems());
        assertEquals(20, page.skip());
        assertEquals(20, page.maxItems());
        assertTrue(page.hasMore());
        assertEquals(1, page.items().size());
    }

    @Test
    void withoutPaginationTheTotalIsTheItemCount() {
        when(client.listChildren(eq("p"), any(), anyInt(), anyInt(), anyString()))
                .thenReturn(listing("{\"id\":\"a\"}", "{\"id\":\"b\"}"));

        NodePage page = service.listChildrenPage("p", 0, 20, "name", "asc");

        assertEquals(2, page.totalItems());
        assertFalse(page.hasMore());
    }

    // ---------------------------------------------------------------- folders

    @Test
    void aMemberFolderIsTagged() {
        when(client.createFolder(anyString(), anyString(), any())).thenReturn(json("{\"entry\":{\"id\":\"f\",\"name\":\"X\"}}"));

        service.createFolder("p", "X", true);
        service.createFolder("p", "Y", false);

        verify(client).createFolder("p", "X", FolderTemplateService.MEMBER_FOLDER_MARK);
        verify(client).createFolder("p", "Y", null);
    }

    @Test
    void createFromTemplateBuildsTheWholeTreeWithMarks() {
        FolderTemplateDto template = new FolderTemplateDto("t1", "Client", "", List.of(
                new FolderNode("Contracts", List.of(new FolderNode("2026", List.of()))),
                new FolderNode("Invoices", null)));
        when(templates.find("t1")).thenReturn(Optional.of(template));
        when(client.createFolder("p", "Acme", "zapis-template:Client")).thenReturn(entry("top"));
        when(client.createFolder("top", "Contracts", SpaceService.STRUCTURE_MARK)).thenReturn(entry("contracts"));
        when(client.createFolder("contracts", "2026", SpaceService.STRUCTURE_MARK)).thenReturn(entry("y2026"));
        when(client.createFolder("top", "Invoices", SpaceService.STRUCTURE_MARK)).thenReturn(entry("invoices"));

        NodeDto created = service.createFromTemplate("p", "t1", "  Acme  ");

        assertEquals("top", created.id());
        verify(client).createFolder("contracts", "2026", SpaceService.STRUCTURE_MARK);
        verify(client).createFolder("top", "Invoices", SpaceService.STRUCTURE_MARK);
        verify(client, never()).deleteNode(anyString(), anyBoolean());
    }

    @Test
    void aTemplateWithoutSubfoldersCreatesOnlyTheTopFolder() {
        when(templates.find("t1")).thenReturn(Optional.of(new FolderTemplateDto("t1", "Client", "", null)));
        when(client.createFolder("p", "Acme", "zapis-template:Client")).thenReturn(entry("top"));

        service.createFromTemplate("p", "t1", "Acme");

        verify(client).createFolder(anyString(), anyString(), anyString());
    }

    @Test
    void anUnknownTemplateIsNotFoundAndNothingIsCreated() {
        when(templates.find("nope")).thenReturn(Optional.empty());

        var e = assertThrows(AlfrescoApiException.class, () -> service.createFromTemplate("p", "nope", "Acme"));

        assertEquals(404, e.getStatus());
        verifyNoInteractions(client);
    }

    @Test
    void aFailureInTheTreeRemovesTheHalfBuiltFolder() {
        when(templates.find("t1")).thenReturn(Optional.of(new FolderTemplateDto("t1", "Client", "",
                List.of(new FolderNode("A", List.of()), new FolderNode("B", List.of())))));
        when(client.createFolder("p", "Acme", "zapis-template:Client")).thenReturn(entry("top"));
        when(client.createFolder("top", "A", SpaceService.STRUCTURE_MARK)).thenReturn(entry("a"));
        when(client.createFolder("top", "B", SpaceService.STRUCTURE_MARK)).thenThrow(new AlfrescoApiException(403, "no rights"));

        var e = assertThrows(AlfrescoApiException.class, () -> service.createFromTemplate("p", "t1", "Acme"));

        assertEquals(403, e.getStatus());
        verify(client).deleteNode("top", true);
    }

    @Test
    void aFailedCleanupDoesNotHideTheOriginalError() {
        when(templates.find("t1")).thenReturn(Optional.of(new FolderTemplateDto("t1", "Client", "", List.of(new FolderNode("A", List.of())))));
        when(client.createFolder("p", "Acme", "zapis-template:Client")).thenReturn(entry("top"));
        when(client.createFolder("top", "A", SpaceService.STRUCTURE_MARK)).thenThrow(new AlfrescoApiException(403, "no rights"));
        doThrow(new RuntimeException("cleanup failed")).when(client).deleteNode("top", true);

        var e = assertThrows(AlfrescoApiException.class, () -> service.createFromTemplate("p", "t1", "Acme"));

        assertEquals(403, e.getStatus());
    }

    @Test
    void whenTheTopFolderCannotBeCreatedThereIsNothingToClean() {
        when(templates.find("t1")).thenReturn(Optional.of(new FolderTemplateDto("t1", "Client", "", List.of())));
        when(client.createFolder("p", "Acme", "zapis-template:Client")).thenThrow(new AlfrescoApiException(409, "exists"));

        assertEquals(409, assertThrows(AlfrescoApiException.class, () -> service.createFromTemplate("p", "t1", "Acme")).getStatus());
        verify(client, never()).deleteNode(anyString(), anyBoolean());
    }

    // ---------------------------------------------------------------- upload

    @Test
    void uploadPassesTheFileAlongAndMapsTheResult() {
        MultipartFile file = new MockMultipartFile("file", "a.pdf", "application/pdf", "bytes".getBytes());
        when(client.uploadFile("p", "a.pdf", "bytes".getBytes(), "application/pdf", true)).thenReturn(entry("n1"));

        assertEquals("n1", service.uploadFile("p", file, true).id());
    }

    @Test
    void uploadWithoutOverwriteLetsAlfrescoRename() {
        MultipartFile file = new MockMultipartFile("file", "a.pdf", "application/pdf", "bytes".getBytes());
        when(client.uploadFile(anyString(), anyString(), any(), any(), anyBoolean())).thenReturn(entry("n1"));

        service.uploadFile("p", file, false);

        verify(client).uploadFile("p", "a.pdf", "bytes".getBytes(), "application/pdf", false);
    }

    @Test
    void anUnreadableUploadIsAnIoError() throws IOException {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getBytes()).thenThrow(new IOException("disk"));

        assertThrows(UncheckedIOException.class, () -> service.uploadFile("p", file, true));
        verifyNoInteractions(client);
    }

    // ------------------------------------------------------- rename/move/copy

    @Test
    void renameTrimsTheNewName() {
        when(client.getNode("n1", "properties")).thenReturn(json("{\"entry\":{\"id\":\"n1\",\"isFolder\":false}}"));
        when(client.updateNode(eq("n1"), any())).thenReturn(entry("n1"));

        service.renameNode("n1", "  new.pdf  ");

        ArgumentCaptor<JsonNode> body = ArgumentCaptor.forClass(JsonNode.class);
        verify(client).updateNode(eq("n1"), body.capture());
        assertEquals("new.pdf", body.getValue().path("name").asText());
    }

    @Test
    void theFixedStructureFoldersCannotBeRenamed() {
        when(client.getNode("f1", "properties")).thenReturn(json(
                "{\"entry\":{\"id\":\"f1\",\"isFolder\":true,\"properties\":{\"cm:description\":\"zapis-structure\"}}}"));

        var e = assertThrows(AlfrescoApiException.class, () -> service.renameNode("f1", "x"));

        assertEquals(403, e.getStatus());
        verify(client, never()).updateNode(anyString(), any());
    }

    @Test
    void otherFoldersAndFilesWithTheSameDescriptionCanBeRenamed() {
        when(client.getNode("f1", "properties")).thenReturn(json(
                "{\"entry\":{\"id\":\"f1\",\"isFolder\":true,\"properties\":{\"cm:description\":\"zapis-member\"}}}"));
        when(client.getNode("f2", "properties")).thenReturn(json(
                "{\"entry\":{\"id\":\"f2\",\"isFolder\":false,\"properties\":{\"cm:description\":\"zapis-structure\"}}}"));
        when(client.getNode("f3", "properties")).thenReturn(json("{\"entry\":{\"id\":\"f3\",\"isFolder\":true}}"));
        when(client.updateNode(anyString(), any())).thenReturn(entry("x"));

        service.renameNode("f1", "a");
        service.renameNode("f2", "b");
        service.renameNode("f3", "c");

        verify(client, org.mockito.Mockito.times(3)).updateNode(anyString(), any());
    }

    @Test
    void moveAndCopyDelegateToAlfresco() {
        when(client.moveNode("n1", "target")).thenReturn(entry("n1"));
        when(client.copyNode("n1", "target")).thenReturn(entry("n2"));

        assertEquals("n1", service.moveNode("n1", "target").id());
        assertEquals("n2", service.copyNode("n1", "target").id());
    }

    @Test
    void downloadReturnsTheOriginalContent() {
        when(client.getContent("n1")).thenReturn("bytes".getBytes());

        assertArrayEquals("bytes".getBytes(), service.downloadContent("n1"));
    }

    // ------------------------------------------------------------ annotations

    @Test
    void annotatedContentIsOnlyServedAfterTheAccessCheck() {
        when(client.getNode("n1", null)).thenThrow(new AlfrescoApiException(403, "no"));

        assertThrows(AlfrescoApiException.class, () -> service.getAnnotatedContent("n1"));
        verifyNoInteractions(annotations);
    }

    @Test
    void annotatedContentIsTheStoredCopyOrEmpty() {
        when(client.getNode("n1", null)).thenReturn(entry("n1"));
        when(annotations.pdf("n1")).thenReturn(Optional.of("copy".getBytes()));
        when(annotations.pdf("n2")).thenReturn(Optional.empty());
        when(client.getNode("n2", null)).thenReturn(entry("n2"));

        assertArrayEquals("copy".getBytes(), service.getAnnotatedContent("n1").orElseThrow());
        assertTrue(service.getAnnotatedContent("n2").isEmpty());
    }

    @Test
    void theAnnotatedFileNameReplacesThePdfExtension() {
        named("n1", "report.pdf");
        named("n2", "REPORT.PDF");
        named("n3", "notes.txt");
        named("n4", "archive.pdf.bak");

        assertEquals("report (annotated).pdf", service.annotatedFileName("n1"));
        assertEquals("REPORT (annotated).pdf", service.annotatedFileName("n2"));
        assertEquals("notes.txt (annotated).pdf", service.annotatedFileName("n3"));
        assertEquals("archive.pdf.bak (annotated).pdf", service.annotatedFileName("n4"));
    }

    @Test
    void theAnnotatedFileNameFallsBackToTheNodeId() {
        when(client.getNode("n9", null)).thenReturn(json("{\"entry\":{\"id\":\"n9\"}}"));

        assertEquals("n9 (annotated).pdf", service.annotatedFileName("n9"));
    }

    @Test
    void outdatedNeedsBothVersionsToBeKnownAndDifferent() {
        when(annotations.meta("n1")).thenReturn(Optional.of(new AnnotationStore.Meta("1.0", "a", "t", 1)));
        when(annotations.meta("n2")).thenReturn(Optional.of(new AnnotationStore.Meta(null, "a", "t", 1)));
        when(annotations.meta("n3")).thenReturn(Optional.of(new AnnotationStore.Meta("1.0", "a", "t", 1)));
        versioned("n1", "1.0");
        versioned("n2", "2.0");
        when(client.getNode("n3", null)).thenReturn(json("{\"entry\":{\"id\":\"n3\"}}")); // no version label at all

        assertFalse(service.getAnnotations("n1").outdated());
        assertFalse(service.getAnnotations("n2").outdated());
        assertFalse(service.getAnnotations("n3").outdated());
    }

    @Test
    void savingRefusesNonPdfFilesBeforeLookingAtRevisions() {
        node("n1", "image/png", true, "1.0");

        var e = assertThrows(RequestRejectedException.class, () -> service.saveAnnotations("n1", new byte[]{1}, List.of(), "anna", 0));

        assertEquals(415, e.getStatus());
        verifyNoInteractions(annotations, pdfAnnotations);
    }

    @Test
    void savingRefusesFilesWithoutAContentType() {
        when(client.getNode(eq("n1"), any())).thenReturn(json(
                "{\"entry\":{\"id\":\"n1\",\"allowableOperations\":[\"update\"]}}"));

        assertEquals(415, assertThrows(RequestRejectedException.class,
                () -> service.saveAnnotations("n1", new byte[]{1}, List.of(), "anna", 0)).getStatus());
    }

    @Test
    void aRejectedPdfIsNotStored() {
        node("n1", "application/pdf", true, "1.0");
        when(annotations.meta("n1")).thenReturn(Optional.empty());
        when(client.getContent("n1")).thenReturn(new byte[]{9});
        doThrow(new RequestRejectedException(422, "different pages")).when(pdfAnnotations).validate(any(), any());

        var e = assertThrows(RequestRejectedException.class, () -> service.saveAnnotations("n1", new byte[]{1}, List.of(), "anna", 0));

        assertEquals(422, e.getStatus());
        verify(annotations, never()).save(anyString(), any(), any());
    }

    @Test
    void savingAddsTheNotesAndBumpsTheRevision() {
        node("n1", "application/pdf", true, "3.0");
        when(annotations.meta("n1")).thenReturn(Optional.of(new AnnotationStore.Meta("3.0", "ben", "t", 2)));
        when(client.getContent("n1")).thenReturn(new byte[]{9});
        List<StickyNote> notes = List.of(new StickyNote(1, 0.5, 0.5, "hi", null));
        when(pdfAnnotations.addNotes(new byte[]{1}, notes, "anna")).thenReturn(new byte[]{1, 2});

        var info = service.saveAnnotations("n1", new byte[]{1}, notes, "anna", 2);

        assertEquals(3, info.revision());
        assertTrue(info.exists());
        assertFalse(info.outdated());
        assertEquals("anna", info.updatedBy());
        assertEquals("3.0", info.baseVersion());
        ArgumentCaptor<AnnotationStore.Meta> meta = ArgumentCaptor.forClass(AnnotationStore.Meta.class);
        verify(annotations).save(eq("n1"), eq(new byte[]{1, 2}), meta.capture());
        assertEquals(3, meta.getValue().revision());
    }

    @Test
    void aBaseRevisionAheadOfTheStoredOneIsAlsoAConflict() {
        node("n1", "application/pdf", true, "1.0");
        when(annotations.meta("n1")).thenReturn(Optional.empty());

        var e = assertThrows(RequestRejectedException.class, () -> service.saveAnnotations("n1", new byte[]{1}, List.of(), "anna", 5));

        assertEquals(409, e.getStatus());
    }

    @Test
    void deletingAnnotationsNeedsUpdateRights() {
        node("n1", "application/pdf", true, "1.0");
        service.deleteAnnotations("n1");
        verify(annotations).delete("n1");

        node("n2", "application/pdf", false, "1.0");
        assertEquals(403, assertThrows(RequestRejectedException.class, () -> service.deleteAnnotations("n2")).getStatus());
        verify(annotations, never()).delete("n2");
    }

    @Test
    void otherAllowableOperationsAreNotEnoughToAnnotate() {
        when(client.getNode(eq("n1"), any())).thenReturn(json(
                "{\"entry\":{\"id\":\"n1\",\"allowableOperations\":[\"delete\",\"create\"]}}"));

        assertEquals(403, assertThrows(RequestRejectedException.class, () -> service.deleteAnnotations("n1")).getStatus());
    }

    // ---------------------------------------------------------------- delete

    @Test
    void aFailedAnnotationCleanupDoesNotFailAPermanentDelete() {
        doThrow(new RuntimeException("store down")).when(annotations).delete("n1");

        service.deleteNode("n1", true);

        verify(client).deleteNode("n1", true);
    }

    @Test
    void whenAlfrescoRefusesTheDeleteTheAnnotationsStay() {
        doThrow(new AlfrescoApiException(403, "no")).when(client).deleteNode("n1", true);

        assertThrows(AlfrescoApiException.class, () -> service.deleteNode("n1", true));
        verify(annotations, never()).delete(anyString());
    }

    // --------------------------------------------------------------- metadata

    @Test
    void metadataBodyHoldsOnlyWhatWasGiven() {
        when(client.updateNode(anyString(), any())).thenReturn(entry("n1"));

        service.updateMetadata("n1", List.of("cm:titled"), Map.of("cm:title", "Hello"));
        service.updateMetadata("n1", null, null);
        service.updateMetadata("n1", List.of(), Map.of());

        ArgumentCaptor<JsonNode> body = ArgumentCaptor.forClass(JsonNode.class);
        verify(client, org.mockito.Mockito.times(3)).updateNode(eq("n1"), body.capture());
        JsonNode full = body.getAllValues().get(0);
        assertEquals("cm:titled", full.path("aspectNames").get(0).asText());
        assertEquals("Hello", full.path("properties").path("cm:title").asText());
        assertTrue(body.getAllValues().get(1).isEmpty());
        assertTrue(body.getAllValues().get(2).isEmpty());
    }

    // ----------------------------------------------------------------- search

    @Test
    void searchMapsHitsAndCanBeScopedToASpace() {
        when(client.search("term", 10, null)).thenReturn(listing("{\"id\":\"a\"}"));
        when(client.search("term", 10, "clients")).thenReturn(listing("{\"id\":\"b\"}", "{\"id\":\"c\"}"));

        assertEquals(1, service.search("term", 10).size());
        assertEquals(2, service.search("term", 10, "clients").size());
    }

    @Test
    void searchWithoutHitsIsEmpty() {
        when(client.search("none", 10, null)).thenReturn(listing());

        assertTrue(service.search("none", 10).isEmpty());
    }

    @Test
    void recentDocumentsAreMapped() {
        when(client.recentFiles(5)).thenReturn(listing("{\"id\":\"a\"}"));

        assertEquals("a", service.recentDocuments(5).getFirst().id());
    }

    // ---------------------------------------------------------------- preview

    @Test
    void noMimeTypeMeansNoPreview() {
        when(client.getNode("n1", null)).thenReturn(json("{\"entry\":{\"id\":\"n1\"}}"));

        assertTrue(service.getPreview("n1").isEmpty());
        verify(client, never()).getContent(anyString());
    }

    @Test
    void pdfsAndImagesAreServedAsTheyAre() {
        mime("n1", "application/pdf");
        mime("n2", "image/png");
        when(client.getContent("n1")).thenReturn(new byte[]{1});
        when(client.getContent("n2")).thenReturn(new byte[]{2});

        var pdf = service.getPreview("n1").orElseThrow();
        var png = service.getPreview("n2").orElseThrow();

        assertEquals("application/pdf", pdf.mimeType());
        assertArrayEquals(new byte[]{1}, pdf.content());
        assertEquals("image/png", png.mimeType());
        assertArrayEquals(new byte[]{2}, png.content());
    }

    @Test
    void aTiffIsServedAsAPdf() throws IOException {
        mime("n1", "image/tiff");
        when(client.getContent("n1")).thenReturn(new byte[]{7});
        when(merge.tiffToPdf(new byte[]{7})).thenReturn(new byte[]{8});

        var preview = service.getPreview("n1").orElseThrow();

        assertEquals("application/pdf", preview.mimeType());
        assertArrayEquals(new byte[]{8}, preview.content());
    }

    @Test
    void anUnreadableTiffHasNoPreview() throws IOException {
        mime("n1", "image/tiff");
        when(client.getContent("n1")).thenReturn(new byte[]{7});
        when(merge.tiffToPdf(any())).thenThrow(new IOException("bad"));

        assertTrue(service.getPreview("n1").isEmpty());
    }

    @Test
    void officeFilesAreRenderedToPdfByAlfresco() {
        for (String mime : List.of("application/msword", "text/plain", "text/csv", "application/rtf",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document")) {
            mime("n1", mime);
            when(client.waitForRenditionContent("n1", "pdf", Duration.ofSeconds(30))).thenReturn(new byte[]{5});

            var preview = service.getPreview("n1").orElseThrow();

            assertEquals("application/pdf", preview.mimeType(), mime);
            assertArrayEquals(new byte[]{5}, preview.content());
        }
        verify(client, org.mockito.Mockito.times(5)).requestRendition("n1", "pdf");
    }

    @Test
    void aFailedRenditionMeansNoPreviewNotAnError() {
        mime("n1", "application/msword");
        when(client.waitForRenditionContent(anyString(), anyString(), any())).thenThrow(new AlfrescoApiException(422, "failed"));

        assertTrue(service.getPreview("n1").isEmpty());
    }

    @Test
    void aRenditionRequestThatFailsMeansNoPreview() {
        mime("n1", "application/msword");
        doThrow(new AlfrescoApiException(500, "boom")).when(client).requestRendition("n1", "pdf");

        assertTrue(service.getPreview("n1").isEmpty());
    }

    @Test
    void unknownFileTypesHaveNoPreview() {
        mime("n1", "application/zip");

        assertTrue(service.getPreview("n1").isEmpty());
        verify(client, never()).getContent(anyString());
        verify(client, never()).requestRendition(anyString(), anyString());
    }

    @Test
    void errorsOtherThanRenditionOnesArePassedOn() {
        when(client.getNode("n1", null)).thenThrow(new AlfrescoApiException(404, "gone"));

        assertEquals(404, assertThrows(AlfrescoApiException.class, () -> service.getPreview("n1")).getStatus());
    }

    // ------------------------------------------------------------------ merge

    @Test
    void mergeBuildsOnePdfFromMixedSourcesAndUploadsIt() throws IOException {
        AlfrescoService real = new AlfrescoService(client, mapper, new DocumentMergeService(), templates, pdfAnnotations, annotations);
        mime("pdf", "application/pdf", "one.pdf");
        mime("doc", "application/msword", "two.doc");
        when(client.getContent("pdf")).thenReturn(pdf(1, 300));
        when(client.waitForRenditionContent("doc", "pdf", Duration.ofSeconds(60))).thenReturn(pdf(2, 400));
        when(client.uploadFile(eq("target"), anyString(), any(), anyString(), anyBoolean())).thenReturn(entry("merged"));

        NodeDto result = real.mergeToPdf(List.of("pdf", "doc"), "target", "Combined");

        assertEquals("merged", result.id());
        ArgumentCaptor<byte[]> bytes = ArgumentCaptor.forClass(byte[].class);
        verify(client).uploadFile(eq("target"), eq("Combined.pdf"), bytes.capture(), eq("application/pdf"), eq(true));
        try (PDDocument merged = Loader.loadPDF(bytes.getValue())) {
            assertEquals(3, merged.getNumberOfPages());
        }
        verify(client).requestRendition("doc", "pdf");
    }

    @Test
    void theTargetNameKeepsAnExistingPdfExtensionInAnyCase() {
        when(merge.merge(any(), any())).thenReturn(new byte[]{1});
        when(client.uploadFile(anyString(), anyString(), any(), anyString(), anyBoolean())).thenReturn(entry("m"));

        service.mergeToPdf(List.of("a"), "t", "result.PDF");
        service.mergeToPdf(List.of("a"), "t", "result.pdf");

        verify(client).uploadFile("t", "result.PDF", new byte[]{1}, "application/pdf", true);
        verify(client).uploadFile("t", "result.pdf", new byte[]{1}, "application/pdf", true);
    }

    @Test
    void imagesAreFetchedDirectlyWithoutARendition() {
        when(merge.merge(any(), any())).thenAnswer(inv -> {
            java.util.function.Function<String, DocumentMergeService.SourceDocument> fetch = inv.getArgument(1);
            DocumentMergeService.SourceDocument doc = fetch.apply("img");
            assertEquals("image/jpeg", doc.mimeType());
            assertEquals("photo.jpg", doc.name());
            return new byte[]{1};
        });
        mime("img", "image/jpeg", "photo.jpg");
        when(client.getContent("img")).thenReturn(new byte[]{3});
        when(client.uploadFile(anyString(), anyString(), any(), anyString(), anyBoolean())).thenReturn(entry("m"));

        service.mergeToPdf(List.of("img"), "t", "x");

        verify(client, never()).requestRendition(anyString(), anyString());
    }

    @Test
    void aSourceWithoutAContentTypeIsRenderedByAlfresco() {
        when(merge.merge(any(), any())).thenAnswer(inv -> {
            java.util.function.Function<String, DocumentMergeService.SourceDocument> fetch = inv.getArgument(1);
            DocumentMergeService.SourceDocument doc = fetch.apply("mystery");
            assertEquals("application/pdf", doc.mimeType());
            assertEquals("mystery", doc.name(), "falls back to the node id");
            return new byte[]{1};
        });
        when(client.getNode("mystery", null)).thenReturn(json("{\"entry\":{\"id\":\"mystery\"}}"));
        when(client.waitForRenditionContent("mystery", "pdf", Duration.ofSeconds(60))).thenReturn(new byte[]{4});
        when(client.uploadFile(anyString(), anyString(), any(), anyString(), anyBoolean())).thenReturn(entry("m"));

        service.mergeToPdf(List.of("mystery"), "t", "x");

        verify(client).requestRendition("mystery", "pdf");
    }

    @Test
    void aFailingMergeUploadsNothing() {
        when(merge.merge(any(), any())).thenThrow(new UncheckedIOException(new IOException("bad pdf")));

        assertThrows(UncheckedIOException.class, () -> service.mergeToPdf(List.of("a"), "t", "x"));
        verify(client, never()).uploadFile(anyString(), anyString(), any(), anyString(), anyBoolean());
    }

    // ---------------------------------------------------------------- helpers

    private JsonNode json(String s) {
        return mapper.readTree(s);
    }

    private JsonNode entry(String id) {
        return json("{\"entry\":{\"id\":\"" + id + "\",\"name\":\"" + id + "\"}}");
    }

    private JsonNode listing(String... entries) {
        StringBuilder sb = new StringBuilder();
        for (String e : entries) {
            if (!sb.isEmpty()) sb.append(',');
            sb.append("{\"entry\":").append(e).append('}');
        }
        return json("{\"list\":{\"entries\":[" + sb + "]}}");
    }

    private void named(String id, String name) {
        when(client.getNode(id, null)).thenReturn(json("{\"entry\":{\"id\":\"" + id + "\",\"name\":\"" + name + "\"}}"));
    }

    private void versioned(String id, String version) {
        when(client.getNode(id, null)).thenReturn(json(
                "{\"entry\":{\"id\":\"" + id + "\",\"properties\":{\"cm:versionLabel\":\"" + version + "\"}}}"));
    }

    private void mime(String id, String mimeType) {
        mime(id, mimeType, id);
    }

    private void mime(String id, String mimeType, String name) {
        when(client.getNode(id, null)).thenReturn(json(
                "{\"entry\":{\"id\":\"" + id + "\",\"name\":\"" + name + "\",\"content\":{\"mimeType\":\"" + mimeType + "\"}}}"));
    }

    private void node(String id, String mimeType, boolean updatable, String version) {
        when(client.getNode(eq(id), any())).thenReturn(json("{\"entry\":{\"id\":\"" + id + "\",\"name\":\"a\","
                + "\"content\":{\"mimeType\":\"" + mimeType + "\"},\"properties\":{\"cm:versionLabel\":\"" + version + "\"},"
                + "\"allowableOperations\":" + (updatable ? "[\"update\"]" : "[]") + "}}"));
    }

    private static byte[] pdf(int pages, float width) throws IOException {
        try (PDDocument doc = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            for (int i = 0; i < pages; i++) doc.addPage(new PDPage(new PDRectangle(width, width)));
            doc.save(out);
            return out.toByteArray();
        }
    }
}
