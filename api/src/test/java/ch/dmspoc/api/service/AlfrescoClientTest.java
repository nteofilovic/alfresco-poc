package ch.dmspoc.api.service;

import ch.dmspoc.api.exception.AlfrescoApiException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.client.RequestMatcher;
import org.springframework.test.web.client.ResponseActions;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;
import org.springframework.web.util.UriUtils;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.hamcrest.Matchers.startsWith;
import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withNoContent;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * Every Alfresco URL shape the app depends on, checked against a mock HTTP server: path, query, body, and how
 * errors are translated. No Alfresco is needed.
 */
class AlfrescoClientTest {

    private static final String CORE = "http://alfresco/core";
    private static final String SEARCH = "http://alfresco/search";
    private static final String SERVICE = "http://alfresco/service";
    private static final String WORKFLOW = "http://alfresco/workflow";

    private final ObjectMapper mapper = JsonMapper.builder().build();
    private MockRestServiceServer core;
    private MockRestServiceServer search;
    private MockRestServiceServer service;
    private MockRestServiceServer workflow;
    private AlfrescoClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder coreBuilder = RestClient.builder().baseUrl(CORE);
        RestClient.Builder searchBuilder = RestClient.builder().baseUrl(SEARCH);
        RestClient.Builder serviceBuilder = RestClient.builder().baseUrl(SERVICE);
        RestClient.Builder workflowBuilder = RestClient.builder().baseUrl(WORKFLOW);
        core = MockRestServiceServer.bindTo(coreBuilder).build();
        search = MockRestServiceServer.bindTo(searchBuilder).build();
        service = MockRestServiceServer.bindTo(serviceBuilder).build();
        workflow = MockRestServiceServer.bindTo(workflowBuilder).build();
        client = new AlfrescoClient(coreBuilder.build(), searchBuilder.build(), serviceBuilder.build(), workflowBuilder.build(), mapper);
    }

    @AfterEach
    void everyExpectedCallWasMade() {
        core.verify();
        search.verify();
        service.verify();
        workflow.verify();
    }

    // ------------------------------------------------------------------ nodes

    @Test
    void getNodeAsksForTheRequestedIncludes() {
        expect(core, HttpMethod.GET, CORE + "/nodes/n1", "include", "properties,aspectNames,path")
                .andRespond(ok("{\"entry\":{\"id\":\"n1\"}}"));

        assertEquals("n1", client.getNode("n1", "properties,aspectNames,path").path("entry").path("id").asText());
    }

    @Test
    void getNodeWithoutIncludesSendsNoQuery() {
        core.expect(requestTo(CORE + "/nodes/n1")).andExpect(method(HttpMethod.GET))
                .andRespond(ok("{\"entry\":{\"id\":\"n1\"}}"));

        assertEquals("n1", client.getNode("n1", null).path("entry").path("id").asText());
    }

    @Test
    void errorsBecomeAlfrescoApiExceptionsWithStatusAndBody() {
        core.expect(requestTo(CORE + "/nodes/n1")).andRespond(withStatus(HttpStatus.FORBIDDEN).body("denied by ACL"));

        var e = assertThrows(AlfrescoApiException.class, () -> client.getNode("n1", null));

        assertEquals(403, e.getStatus());
        assertTrue(e.getMessage().contains("denied by ACL"));
    }

    @Test
    void serverErrorsKeepTheirStatus() {
        core.expect(requestTo(CORE + "/nodes/n1")).andRespond(withStatus(HttpStatus.BAD_GATEWAY).body("upstream"));

        assertEquals(502, assertThrows(AlfrescoApiException.class, () -> client.getNode("n1", null)).getStatus());
    }

    @Test
    void findByRelativePathReturnsTheEntry() {
        expect(core, HttpMethod.GET, CORE + "/nodes/root", "relativePath", "zapis-config")
                .andRespond(ok("{\"entry\":{\"id\":\"cfg\",\"isFolder\":true}}"));

        assertEquals("cfg", client.findByRelativePath("root", "zapis-config").path("id").asText());
    }

    @Test
    void findByRelativePathReturnsNullWhenThereIsNothing() {
        expect(core, HttpMethod.GET, CORE + "/nodes/root", "relativePath", "missing")
                .andRespond(withStatus(HttpStatus.NOT_FOUND).body("{}"));

        assertNull(client.findByRelativePath("root", "missing"));
    }

    @Test
    void findByRelativePathStillReportsOtherFailures() {
        expect(core, HttpMethod.GET, CORE + "/nodes/root", "relativePath", "x")
                .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR).body("boom"));

        assertEquals(500, assertThrows(AlfrescoApiException.class, () -> client.findByRelativePath("root", "x")).getStatus());
    }

    @Test
    void aMissingParentIsStillAnErrorForOrdinaryLookups() {
        core.expect(requestTo(CORE + "/nodes/gone")).andRespond(withStatus(HttpStatus.NOT_FOUND).body("{}"));

        assertEquals(404, assertThrows(AlfrescoApiException.class, () -> client.getNode("gone", null)).getStatus());
    }

    @Test
    void listChildrenSendsPagingFilterAndTheDefaultOrder() {
        core.expect(requestTo(startsWith(CORE + "/nodes/p/children")))
                .andExpect(queryParam("skipCount", "20"))
                .andExpect(queryParam("maxItems", "50"))
                .andExpect(queryParam("where", "(isFile=true)"))
                .andExpect(queryParam("include", "properties,aspectNames"))
                .andExpect(queryParam("orderBy", "isFolder DESC,name ASC"))
                .andRespond(ok("{\"list\":{\"entries\":[]}}"));

        client.listChildren("p", "(isFile=true)", 20, 50);
    }

    @Test
    void listChildrenOmitsAMissingFilterAndUsesACustomOrder() {
        core.expect(requestTo(startsWith(CORE + "/nodes/p/children")))
                .andExpect(noQueryParam("where"))
                .andExpect(queryParam("orderBy", "isFolder DESC,modifiedAt DESC,name ASC"))
                .andRespond(ok("{\"list\":{\"entries\":[]}}"));

        client.listChildren("p", null, 0, 10, "isFolder DESC,modifiedAt DESC,name ASC");
    }

    @Test
    void createFolderSendsNameTypeAndOptionalDescription() {
        core.expect(requestTo(CORE + "/nodes/p/children")).andExpect(method(HttpMethod.POST))
                .andExpect(jsonPath("$.name").value("Docs"))
                .andExpect(jsonPath("$.nodeType").value("cm:folder"))
                .andExpect(jsonPath("$.properties").doesNotExist())
                .andRespond(ok("{\"entry\":{\"id\":\"f1\"}}"));
        core.expect(requestTo(CORE + "/nodes/p/children")).andExpect(method(HttpMethod.POST))
                .andExpect(jsonPath("$.properties['cm:description']").value("zapis-structure"))
                .andRespond(ok("{\"entry\":{\"id\":\"f2\"}}"));

        assertEquals("f1", client.createFolder("p", "Docs").path("entry").path("id").asText());
        assertEquals("f2", client.createFolder("p", "Docs", "zapis-structure").path("entry").path("id").asText());
    }

    @Test
    void uploadSendsMultipartWithOverwriteAndNoAutoRename() {
        core.expect(requestTo(CORE + "/nodes/p/children")).andExpect(method(HttpMethod.POST))
                .andExpect(header("Content-Type", startsWith("multipart/form-data")))
                .andExpect(bodyContains("name=\"filedata\"; filename=\"a.pdf\""))
                .andExpect(bodyContains("Content-Type: application/pdf"))
                .andExpect(bodyContains("name=\"overwrite\""))
                .andExpect(bodyContains("true"))
                .andExpect(bodyDoesNotContain("autoRename"))
                .andRespond(ok("{\"entry\":{\"id\":\"n1\"}}"));

        assertEquals("n1", client.uploadFile("p", "a.pdf", "bytes".getBytes(), "application/pdf", true).path("entry").path("id").asText());
    }

    @Test
    void uploadWithoutOverwriteAsksAlfrescoToRenameOnAClash() {
        core.expect(requestTo(CORE + "/nodes/p/children"))
                .andExpect(bodyContains("autoRename"))
                .andExpect(bodyContains("false"))
                .andRespond(ok("{\"entry\":{\"id\":\"n2\"}}"));

        client.uploadFile("p", "a.pdf", "bytes".getBytes(), "application/pdf", false);
    }

    @Test
    void uploadWithoutAContentTypeIsSentAsBinary() {
        core.expect(requestTo(CORE + "/nodes/p/children"))
                .andExpect(bodyContains("Content-Type: application/octet-stream"))
                .andRespond(ok("{\"entry\":{\"id\":\"n3\"}}"));

        client.uploadFile("p", "blob", new byte[]{1, 2}, null, true);
    }

    @Test
    void uploadErrorsAreTranslated() {
        core.expect(requestTo(CORE + "/nodes/p/children")).andRespond(withStatus(HttpStatus.CONFLICT).body("exists"));

        assertEquals(409, assertThrows(AlfrescoApiException.class,
                () -> client.uploadFile("p", "a.pdf", new byte[0], "application/pdf", true)).getStatus());
    }

    @Test
    void getContentReturnsTheBytes() {
        core.expect(requestTo(CORE + "/nodes/n1/content")).andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess(new byte[]{1, 2, 3}, MediaType.APPLICATION_OCTET_STREAM));

        assertArrayEquals(new byte[]{1, 2, 3}, client.getContent("n1"));
    }

    @Test
    void getContentErrorsAreTranslated() {
        core.expect(requestTo(CORE + "/nodes/n1/content")).andRespond(withStatus(HttpStatus.NOT_FOUND).body("none"));

        assertEquals(404, assertThrows(AlfrescoApiException.class, () -> client.getContent("n1")).getStatus());
    }

    @Test
    void updateContentKeepsAMajorVersionWithTheComment() {
        core.expect(requestTo(startsWith(CORE + "/nodes/n1/content"))).andExpect(method(HttpMethod.PUT))
                .andExpect(queryParam("majorVersion", "true"))
                .andExpect(queryParam("comment", "annotated"))
                .andExpect(header("Content-Type", "application/pdf"))
                .andRespond(ok("{\"entry\":{\"id\":\"n1\"}}"));

        assertEquals("n1", client.updateContent("n1", new byte[]{1}, "application/pdf", "annotated").path("entry").path("id").asText());
    }

    @Test
    void moveAndCopyPostTheTargetParent() {
        core.expect(requestTo(CORE + "/nodes/n1/move")).andExpect(method(HttpMethod.POST))
                .andExpect(jsonPath("$.targetParentId").value("t"))
                .andRespond(ok("{\"entry\":{\"id\":\"n1\"}}"));
        core.expect(requestTo(CORE + "/nodes/n1/copy")).andExpect(method(HttpMethod.POST))
                .andExpect(jsonPath("$.targetParentId").value("t"))
                .andRespond(ok("{\"entry\":{\"id\":\"n2\"}}"));

        assertEquals("n1", client.moveNode("n1", "t").path("entry").path("id").asText());
        assertEquals("n2", client.copyNode("n1", "t").path("entry").path("id").asText());
    }

    @Test
    void deleteNodeSaysWhetherItIsPermanent() {
        expect(core, HttpMethod.DELETE, CORE + "/nodes/n1", "permanent", "true").andRespond(withNoContent());
        expect(core, HttpMethod.DELETE, CORE + "/nodes/n2", "permanent", "false").andRespond(withNoContent());

        client.deleteNode("n1", true);
        client.deleteNode("n2", false);
    }

    @Test
    void deleteNodeErrorsAreTranslated() {
        core.expect(requestTo(startsWith(CORE + "/nodes/n1"))).andRespond(withStatus(HttpStatus.FORBIDDEN).body("no"));

        assertEquals(403, assertThrows(AlfrescoApiException.class, () -> client.deleteNode("n1", true)).getStatus());
    }

    @Test
    void updateNodePutsTheGivenBody() {
        core.expect(requestTo(CORE + "/nodes/n1")).andExpect(method(HttpMethod.PUT))
                .andExpect(jsonPath("$.name").value("new.pdf"))
                .andRespond(ok("{\"entry\":{\"id\":\"n1\",\"name\":\"new.pdf\"}}"));

        JsonNode body = mapper.createObjectNode().put("name", "new.pdf");

        assertEquals("new.pdf", client.updateNode("n1", body).path("entry").path("name").asText());
    }

    // --------------------------------------------------------------- workflow

    @Test
    void startProcessSendsTheDefinitionKeyAndVariables() {
        workflow.expect(requestTo(WORKFLOW + "/processes")).andExpect(method(HttpMethod.POST))
                .andExpect(jsonPath("$.processDefinitionKey").value("activitiAdhoc"))
                .andExpect(jsonPath("$.variables.bpm_assignee").value("anna"))
                .andExpect(jsonPath("$.variables.bpm_sendEMailNotifications").value(false))
                .andRespond(ok("{\"entry\":{\"id\":\"p1\"}}"));
        Map<String, Object> vars = new LinkedHashMap<>();
        vars.put("bpm_assignee", "anna");
        vars.put("bpm_sendEMailNotifications", false);

        assertEquals("p1", client.startProcess("activitiAdhoc", vars).path("entry").path("id").asText());
    }

    @Test
    void processesAreReadAndDeleted() {
        workflow.expect(requestTo(WORKFLOW + "/processes/p1")).andExpect(method(HttpMethod.GET))
                .andRespond(ok("{\"entry\":{\"id\":\"p1\"}}"));
        workflow.expect(requestTo(startsWith(WORKFLOW + "/processes?"))).andExpect(method(HttpMethod.GET))
                .andExpect(queryParam("where", "(status='any')"))
                .andExpect(queryParam("maxItems", "1000"))
                .andRespond(ok("{\"list\":{\"entries\":[]}}"));
        workflow.expect(requestTo(WORKFLOW + "/processes/p1")).andExpect(method(HttpMethod.DELETE)).andRespond(withNoContent());

        assertEquals("p1", client.getProcess("p1").path("entry").path("id").asText());
        client.listProcesses("(status='any')");
        client.deleteProcess("p1");
    }

    @Test
    void workflowErrorsAreTranslated() {
        workflow.expect(requestTo(WORKFLOW + "/processes/p1")).andExpect(method(HttpMethod.DELETE))
                .andRespond(withStatus(HttpStatus.NOT_FOUND).body("none"));

        assertEquals(404, assertThrows(AlfrescoApiException.class, () -> client.deleteProcess("p1")).getStatus());
    }

    @Test
    void processVariablesAreListedAndSet() {
        workflow.expect(requestTo(startsWith(WORKFLOW + "/processes/p1/variables?"))).andExpect(queryParam("maxItems", "1000"))
                .andRespond(ok("{\"list\":{\"entries\":[]}}"));
        workflow.expect(requestTo(WORKFLOW + "/processes/p1/variables/zapisCreator")).andExpect(method(HttpMethod.PUT))
                .andExpect(jsonPath("$.name").value("zapisCreator"))
                .andExpect(jsonPath("$.type").value("d:text"))
                .andExpect(jsonPath("$.value").value("ben"))
                .andRespond(ok("{\"entry\":{}}"));

        client.listProcessVariables("p1");
        client.setProcessVariable("p1", "zapisCreator", "d:text", "ben");
    }

    @Test
    void processTasksIncludeFinishedOnesAndStripQuotesFromTheId() {
        workflow.expect(requestTo(startsWith(WORKFLOW + "/tasks?")))
                .andExpect(queryParam("where", "(status='any' AND processId='p1 OR 1=1')"))
                .andRespond(ok("{\"list\":{\"entries\":[]}}"));

        client.listProcessTasks("p1' OR 1=1");
    }

    @Test
    void processItemsAreAttachedAndListed() {
        workflow.expect(requestTo(WORKFLOW + "/processes/p1/items")).andExpect(method(HttpMethod.POST))
                .andExpect(jsonPath("$[0].id").value("d1"))
                .andExpect(jsonPath("$[1].id").value("d2"))
                .andRespond(ok("{\"list\":{\"entries\":[]}}"));
        workflow.expect(requestTo(startsWith(WORKFLOW + "/processes/p1/items?"))).andExpect(queryParam("maxItems", "1000"))
                .andRespond(ok("{\"list\":{\"entries\":[]}}"));

        client.addProcessItems("p1", List.of("d1", "d2"));
        client.listProcessItems("p1");
    }

    @Test
    void tasksAreListedAndFetched() {
        workflow.expect(requestTo(startsWith(WORKFLOW + "/tasks?")))
                .andExpect(queryParam("where", "(status='any' AND assignee='anna')"))
                .andExpect(queryParam("maxItems", "1000"))
                .andRespond(ok("{\"list\":{\"entries\":[]}}"));
        workflow.expect(requestTo(WORKFLOW + "/tasks/t1")).andRespond(ok("{\"entry\":{\"id\":\"t1\"}}"));

        client.listTasks("(status='any' AND assignee='anna')");
        assertEquals("t1", client.getTask("t1").path("entry").path("id").asText());
    }

    @Test
    void taskVariablesAreScoped() {
        workflow.expect(requestTo(startsWith(WORKFLOW + "/tasks/t1/variables?")))
                .andExpect(queryParam("where", "(scope='local')"))
                .andRespond(ok("{\"list\":{\"entries\":[]}}"));
        workflow.expect(requestTo(WORKFLOW + "/tasks/t1/variables/bpm_status")).andExpect(method(HttpMethod.PUT))
                .andExpect(jsonPath("$.value").value("On Hold"))
                .andExpect(jsonPath("$.scope").value("local"))
                .andRespond(ok("{\"entry\":{}}"));

        client.listTaskVariables("t1", "local");
        client.setTaskVariable("t1", "bpm_status", "d:text", "On Hold", "local");
    }

    @Test
    void taskStateIsChangedWithTheSelectParameter() {
        workflow.expect(requestTo(startsWith(WORKFLOW + "/tasks/t1"))).andExpect(method(HttpMethod.PUT))
                .andExpect(queryParam("select", "state"))
                .andExpect(jsonPath("$.state").value("completed"))
                .andRespond(ok("{\"entry\":{\"state\":\"completed\"}}"));

        assertEquals("completed", client.setTaskState("t1", "completed").path("entry").path("state").asText());
    }

    @Test
    void taskStateErrorsAreTranslated() {
        workflow.expect(requestTo(startsWith(WORKFLOW + "/tasks/t1"))).andRespond(withStatus(HttpStatus.CONFLICT).body("done"));

        assertEquals(409, assertThrows(AlfrescoApiException.class, () -> client.setTaskState("t1", "completed")).getStatus());
    }

    // ------------------------------------------------------------- renditions

    @Test
    void requestRenditionPostsTheRenditionId() {
        core.expect(requestTo(CORE + "/nodes/n1/renditions")).andExpect(method(HttpMethod.POST))
                .andExpect(jsonPath("$.id").value("pdf"))
                .andRespond(withStatus(HttpStatus.ACCEPTED).contentType(MediaType.APPLICATION_JSON).body("{}"));

        client.requestRendition("n1", "pdf");
    }

    @Test
    void anExistingRenditionIsNotAnError() {
        core.expect(requestTo(CORE + "/nodes/n1/renditions")).andRespond(withStatus(HttpStatus.CONFLICT).body("exists"));

        client.requestRendition("n1", "pdf");
    }

    @Test
    void otherRenditionRequestErrorsArePassedOn() {
        core.expect(requestTo(CORE + "/nodes/n1/renditions")).andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR).body("boom"));

        assertEquals(500, assertThrows(AlfrescoApiException.class, () -> client.requestRendition("n1", "pdf")).getStatus());
    }

    @Test
    void aReadyRenditionIsDownloaded() {
        core.expect(requestTo(CORE + "/nodes/n1/renditions/pdf")).andRespond(ok("{\"entry\":{\"status\":\"CREATED\"}}"));
        core.expect(requestTo(CORE + "/nodes/n1/renditions/pdf/content"))
                .andRespond(withSuccess(new byte[]{9, 9}, MediaType.APPLICATION_PDF));

        assertArrayEquals(new byte[]{9, 9}, client.waitForRenditionContent("n1", "pdf", Duration.ofSeconds(5)));
    }

    @Test
    void aRenditionThatIsNotReadyYetIsPolledAgain() {
        core.expect(requestTo(CORE + "/nodes/n1/renditions/pdf")).andRespond(ok("{\"entry\":{\"status\":\"NOT_CREATED\"}}"));
        core.expect(requestTo(CORE + "/nodes/n1/renditions/pdf")).andRespond(ok("{\"entry\":{\"status\":\"CREATED\"}}"));
        core.expect(requestTo(CORE + "/nodes/n1/renditions/pdf/content"))
                .andRespond(withSuccess(new byte[]{1}, MediaType.APPLICATION_PDF));

        assertArrayEquals(new byte[]{1}, client.waitForRenditionContent("n1", "pdf", Duration.ofSeconds(10)));
    }

    @Test
    void aFailedRenditionIsReportedAsUnprocessable() {
        core.expect(requestTo(CORE + "/nodes/n1/renditions/pdf")).andRespond(ok("{\"entry\":{\"status\":\"FAILED\"}}"));

        var e = assertThrows(AlfrescoApiException.class, () -> client.waitForRenditionContent("n1", "pdf", Duration.ofSeconds(5)));

        assertEquals(422, e.getStatus());
    }

    @Test
    void waitingWithNoTimeLeftTimesOutWithoutCallingAlfresco() {
        var e = assertThrows(AlfrescoApiException.class, () -> client.waitForRenditionContent("n1", "pdf", Duration.ZERO));

        assertEquals(504, e.getStatus());
    }

    @Test
    void aMissingRenditionIsPassedOn() {
        core.expect(requestTo(CORE + "/nodes/n1/renditions/pdf")).andRespond(withStatus(HttpStatus.NOT_FOUND).body("none"));

        assertEquals(404, assertThrows(AlfrescoApiException.class,
                () -> client.waitForRenditionContent("n1", "pdf", Duration.ofSeconds(5))).getStatus());
    }

    // ------------------------------------------------------------------ sites

    @Test
    void createSiteSendsIdTitleDescriptionAndVisibility() {
        core.expect(requestTo(CORE + "/sites")).andExpect(method(HttpMethod.POST))
                .andExpect(jsonPath("$.id").value("clients"))
                .andExpect(jsonPath("$.title").value("Clients"))
                .andExpect(jsonPath("$.description").value("All clients"))
                .andExpect(jsonPath("$.visibility").value("PUBLIC"))
                .andRespond(ok("{\"entry\":{\"id\":\"clients\"}}"));

        client.createSite("clients", "Clients", "All clients", "PUBLIC");
    }

    @Test
    void createSiteDefaultsToPrivateAndSkipsAMissingDescription() {
        core.expect(requestTo(CORE + "/sites"))
                .andExpect(jsonPath("$.description").doesNotExist())
                .andExpect(jsonPath("$.visibility").value("PRIVATE"))
                .andRespond(ok("{\"entry\":{\"id\":\"x\"}}"));

        client.createSite("x", "X", null, null);
    }

    @Test
    void deleteSiteIsPermanent() {
        expect(core, HttpMethod.DELETE, CORE + "/sites/clients", "permanent", "true").andRespond(withNoContent());

        client.deleteSite("clients");
    }

    @Test
    void siteContainersAndListsUseTheirEndpoints() {
        core.expect(requestTo(CORE + "/sites/clients/containers/documentLibrary")).andRespond(ok("{\"entry\":{\"id\":\"lib\"}}"));
        core.expect(requestTo(startsWith(CORE + "/sites?"))).andExpect(queryParam("skipCount", "5")).andExpect(queryParam("maxItems", "10"))
                .andRespond(ok("{\"list\":{\"entries\":[]}}"));
        core.expect(requestTo(startsWith(CORE + "/people/-me-/sites?"))).andExpect(queryParam("maxItems", "1000"))
                .andRespond(ok("{\"list\":{\"entries\":[]}}"));
        core.expect(requestTo(startsWith(CORE + "/sites/clients/members?"))).andExpect(queryParam("maxItems", "1000"))
                .andRespond(ok("{\"list\":{\"entries\":[]}}"));

        assertEquals("lib", client.getSiteContainer("clients", "documentLibrary").path("entry").path("id").asText());
        client.listSites(5, 10);
        client.listMySites(1000);
        client.listSiteMembers("clients");
    }

    @Test
    void siteMembersAreAddedUpdatedAndRemoved() {
        core.expect(requestTo(CORE + "/sites/clients/members")).andExpect(method(HttpMethod.POST))
                .andExpect(jsonPath("$.id").value("anna")).andExpect(jsonPath("$.role").value("SiteManager"))
                .andRespond(ok("{\"entry\":{}}"));
        core.expect(requestTo(CORE + "/sites/clients/members/anna")).andExpect(method(HttpMethod.PUT))
                .andExpect(jsonPath("$.role").value("SiteConsumer")).andExpect(jsonPath("$.id").doesNotExist())
                .andRespond(ok("{\"entry\":{}}"));
        core.expect(requestTo(CORE + "/sites/clients/members/anna")).andExpect(method(HttpMethod.DELETE)).andRespond(withNoContent());

        client.addSiteMember("clients", "anna", "SiteManager");
        client.updateSiteMember("clients", "anna", "SiteConsumer");
        client.removeSiteMember("clients", "anna");
    }

    @Test
    void siteMemberErrorsAreTranslated() {
        core.expect(requestTo(CORE + "/sites/clients/members")).andRespond(withStatus(HttpStatus.CONFLICT).body("member"));
        core.expect(requestTo(CORE + "/sites/clients/members/ghost")).andRespond(withStatus(HttpStatus.NOT_FOUND).body("none"));

        assertEquals(409, assertThrows(AlfrescoApiException.class, () -> client.addSiteMember("clients", "anna", "SiteManager")).getStatus());
        assertEquals(404, assertThrows(AlfrescoApiException.class, () -> client.removeSiteMember("clients", "ghost")).getStatus());
    }

    // ----------------------------------------------------------------- people

    @Test
    void createPersonSendsTheProfileAndEnablesTheAccount() {
        core.expect(requestTo(CORE + "/people")).andExpect(method(HttpMethod.POST))
                .andExpect(jsonPath("$.id").value("anna")).andExpect(jsonPath("$.firstName").value("Anna"))
                .andExpect(jsonPath("$.lastName").value("Meier")).andExpect(jsonPath("$.email").value("a@x.ch"))
                .andExpect(jsonPath("$.password").value("secret")).andExpect(jsonPath("$.enabled").value(true))
                .andRespond(ok("{\"entry\":{\"id\":\"anna\"}}"));
        core.expect(requestTo(CORE + "/people")).andExpect(jsonPath("$.lastName").doesNotExist())
                .andRespond(ok("{\"entry\":{\"id\":\"ben\"}}"));
        core.expect(requestTo(CORE + "/people")).andExpect(jsonPath("$.lastName").doesNotExist())
                .andRespond(ok("{\"entry\":{\"id\":\"carl\"}}"));

        client.createPerson("anna", "Anna", "Meier", "a@x.ch", "secret");
        client.createPerson("ben", "Ben", null, "b@x.ch", "secret");
        client.createPerson("carl", "Carl", "   ", "c@x.ch", "secret");
    }

    @Test
    void peopleAreReadListedAndUpdated() {
        core.expect(requestTo(CORE + "/people/anna")).andExpect(method(HttpMethod.GET)).andRespond(ok("{\"entry\":{\"id\":\"anna\"}}"));
        core.expect(requestTo(startsWith(CORE + "/people?"))).andExpect(queryParam("maxItems", "1000")).andExpect(queryParam("orderBy", "id ASC"))
                .andRespond(ok("{\"list\":{\"entries\":[]}}"));
        core.expect(requestTo(CORE + "/people/anna")).andExpect(method(HttpMethod.PUT))
                .andExpect(jsonPath("$.firstName").value("Anna")).andExpect(jsonPath("$.lastName").value(""))
                .andRespond(ok("{\"entry\":{}}"));
        core.expect(requestTo(CORE + "/people/anna")).andExpect(method(HttpMethod.PUT))
                .andExpect(jsonPath("$.enabled").value(false)).andRespond(ok("{\"entry\":{}}"));
        core.expect(requestTo(CORE + "/people/anna")).andExpect(method(HttpMethod.PUT))
                .andExpect(jsonPath("$.password").value("new-secret")).andRespond(ok("{\"entry\":{}}"));

        assertEquals("anna", client.getPerson("anna").path("entry").path("id").asText());
        client.listPeople();
        client.updatePerson("anna", "Anna", null, "a@x.ch");
        client.setPersonEnabled("anna", false);
        client.updatePersonPassword("anna", "new-secret");
    }

    @Test
    void anUnknownPersonIsNotFound() {
        core.expect(requestTo(CORE + "/people/ghost")).andRespond(withStatus(HttpStatus.NOT_FOUND).body("none"));

        assertEquals(404, assertThrows(AlfrescoApiException.class, () -> client.getPerson("ghost")).getStatus());
    }

    @Test
    void deletingAPersonUsesTheLegacyWebscript() {
        service.expect(requestTo(SERVICE + "/api/people/anna")).andExpect(method(HttpMethod.DELETE)).andRespond(withNoContent());
        service.expect(requestTo(SERVICE + "/api/people/ghost")).andRespond(withStatus(HttpStatus.NOT_FOUND).body("none"));

        client.deletePerson("anna");
        assertEquals(404, assertThrows(AlfrescoApiException.class, () -> client.deletePerson("ghost")).getStatus());
    }

    // ----------------------------------------------------------------- search

    @Test
    void searchQueriesNamesAndTextInsideAllSpaces() {
        search.expect(requestTo(SEARCH + "/search")).andExpect(method(HttpMethod.POST))
                .andExpect(jsonPath("$.query.language").value("afts"))
                .andExpect(jsonPath("$.query.query").value(
                        "(cm:name:\"*invoice*\" OR TEXT:\"invoice\") AND PATH:\"/app:company_home/st:sites//*\""))
                .andExpect(jsonPath("$.include[0]").value("path"))
                .andExpect(jsonPath("$.paging.maxItems").value(25))
                .andExpect(jsonPath("$.paging.skipCount").value(0))
                .andRespond(ok("{\"list\":{\"entries\":[]}}"));

        client.search("invoice", 25);
    }

    @Test
    void searchCanBeLimitedToOneSpace() {
        search.expect(requestTo(SEARCH + "/search"))
                .andExpect(jsonPath("$.query.query").value(
                        "(cm:name:\"*x*\" OR TEXT:\"x\") AND PATH:\"/app:company_home/st:sites/cm:clients-eu//*\""))
                .andRespond(ok("{\"list\":{\"entries\":[]}}"));

        client.search("x", 10, "clients-eu");
    }

    @Test
    void searchTermsCannotBreakOutOfTheQuery() {
        search.expect(requestTo(SEARCH + "/search"))
                .andExpect(jsonPath("$.query.query").value(
                        "(cm:name:\"*a OR TYPE:cm:folder*\" OR TEXT:\"a OR TYPE:cm:folder\") AND PATH:\"/app:company_home/st:sites//*\""))
                .andRespond(ok("{\"list\":{\"entries\":[]}}"));

        client.search("a\" OR TYPE:cm:folder", 10);
    }

    @Test
    void theSpaceInASearchIsSanitized() {
        search.expect(requestTo(SEARCH + "/search"))
                .andExpect(jsonPath("$.query.query").value(
                        "(cm:name:\"*x*\" OR TEXT:\"x\") AND PATH:\"/app:company_home/st:sites/cm:evilOR//*\""))
                .andRespond(ok("{\"list\":{\"entries\":[]}}"));

        client.search("x", 10, "evil\"/ OR");
    }

    @Test
    void searchErrorsAreTranslated() {
        search.expect(requestTo(SEARCH + "/search")).andRespond(withStatus(HttpStatus.BAD_REQUEST).body("bad query"));

        assertEquals(400, assertThrows(AlfrescoApiException.class, () -> client.search("x", 10)).getStatus());
    }

    @Test
    void recentFilesAreSortedByModificationDescending() {
        search.expect(requestTo(SEARCH + "/search")).andExpect(method(HttpMethod.POST))
                .andExpect(jsonPath("$.query.query").value("TYPE:\"cm:content\" AND PATH:\"/app:company_home/st:sites//*\""))
                .andExpect(jsonPath("$.sort[0].field").value("cm:modified"))
                .andExpect(jsonPath("$.sort[0].ascending").value(false))
                .andExpect(jsonPath("$.paging.maxItems").value(7))
                .andRespond(ok("{\"list\":{\"entries\":[]}}"));

        assertFalse(client.recentFiles(7).isMissingNode());
    }

    @Test
    void recentFilesErrorsAreTranslated() {
        search.expect(requestTo(SEARCH + "/search")).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE).body("solr down"));

        assertEquals(503, assertThrows(AlfrescoApiException.class, () -> client.recentFiles(5)).getStatus());
    }

    // ---------------------------------------------------------------- helpers

    private static org.springframework.test.web.client.ResponseCreator ok(String json) {
        return withSuccess(json, MediaType.APPLICATION_JSON);
    }

    /** A request to {@code urlWithoutQuery} (plus a query) with one expected query parameter. */
    private static ResponseActions expect(MockRestServiceServer server, HttpMethod method, String urlWithoutQuery, String param, String value) {
        return server.expect(requestTo(startsWith(urlWithoutQuery)))
                .andExpect(method(method))
                .andExpect(queryParam(param, value));
    }

    /** Like the stock matcher, but compares the decoded value, so spaces, quotes and equals signs read naturally. */
    private static RequestMatcher queryParam(String name, String expected) {
        return request -> {
            List<String> values = UriComponentsBuilder.fromUri(request.getURI()).build().getQueryParams().get(name);
            assertTrue(values != null && values.stream().map(v -> UriUtils.decode(v, StandardCharsets.UTF_8)).toList().contains(expected),
                    "query parameter " + name + "=" + expected + " not in " + request.getURI());
        };
    }

    private static RequestMatcher noQueryParam(String name) {
        return request -> {
            String query = request.getURI().getRawQuery();
            assertTrue(query == null || !query.contains(name + "="), "unexpected query parameter " + name + " in " + request.getURI());
        };
    }

    private static RequestMatcher bodyContains(String text) {
        return request -> assertTrue(bodyOf(request).contains(text), "request body lacks: " + text);
    }

    private static RequestMatcher bodyDoesNotContain(String text) {
        return request -> assertFalse(bodyOf(request).contains(text), "request body should not hold: " + text);
    }

    private static String bodyOf(org.springframework.http.client.ClientHttpRequest request) {
        return ((MockClientHttpRequest) request).getBodyAsString();
    }
}
