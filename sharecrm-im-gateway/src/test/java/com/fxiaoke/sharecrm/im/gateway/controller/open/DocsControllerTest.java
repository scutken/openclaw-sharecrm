package com.fxiaoke.sharecrm.im.gateway.controller.open;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.DefaultResourceLoader;
import org.springframework.http.ResponseEntity;
import org.springframework.ui.ConcurrentModel;
import org.springframework.ui.Model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DocsControllerTest {

    private final DocsController controller = new DocsController(new DefaultResourceLoader());

    @Test
    void botApi_shouldRenderDocViewerWithMarkdownContent() {
        Model model = new ConcurrentModel();

        String viewName = controller.botApi(model);

        assertEquals("doc-viewer", viewName);
        assertEquals("/im-gateway/docs/bot-api.md", model.getAttribute("markdownUrl"));
        assertTrue(String.valueOf(model.getAttribute("markdown")).contains("# ShareCRM IM Gateway 对外接口文档"));
        assertTrue(String.valueOf(model.getAttribute("contentHtml")).contains("<h1>ShareCRM IM Gateway 对外接口文档（Gateway v1.2）</h1>"));
    }

    @Test
    void botApiMarkdown_shouldReturnMarkdownBody() {
        ResponseEntity<String> response = controller.botApiMarkdown();

        assertEquals("text/markdown;charset=UTF-8", String.valueOf(response.getHeaders().getContentType()));
        assertTrue(String.valueOf(response.getBody()).contains("## 5. SSE 长连接"));
        assertTrue(String.valueOf(response.getBody()).contains("## 6. SSE 事件结构"));
    }
}
