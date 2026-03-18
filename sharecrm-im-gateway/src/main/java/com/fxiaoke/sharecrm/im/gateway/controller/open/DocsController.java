package com.fxiaoke.sharecrm.im.gateway.controller.open;

import org.commonmark.parser.Parser;
import org.commonmark.renderer.html.HtmlRenderer;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.util.StreamUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import static org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Controller
@RequestMapping("/im-gateway/docs")
public class DocsController {

    private static final String BOT_API_MARKDOWN_PATH = "classpath:docs/im-gateway-bot-api.md";
    private static final String BOT_API_MARKDOWN_URL = "/im-gateway/docs/bot-api.md";
    private static final Parser MARKDOWN_PARSER = Parser.builder().build();
    private static final HtmlRenderer HTML_RENDERER = HtmlRenderer.builder().build();

    private final ResourceLoader resourceLoader;

    public DocsController(ResourceLoader resourceLoader) {
        this.resourceLoader = resourceLoader;
    }

    @GetMapping("/bot-api")
    public String botApi(Model model) {
        String markdown = loadMarkdown();
        String html = HTML_RENDERER.render(MARKDOWN_PARSER.parse(markdown));
        model.addAttribute("title", "ShareCRM IM Gateway Bot API");
        model.addAttribute("markdown", markdown);
        model.addAttribute("markdownUrl", BOT_API_MARKDOWN_URL);
        model.addAttribute("contentHtml", html);
        return "doc-viewer";
    }

    @GetMapping(value = "/bot-api.md", produces = "text/markdown;charset=UTF-8")
    public ResponseEntity<String> botApiMarkdown() {
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/markdown;charset=UTF-8"))
                .body(loadMarkdown());
    }

    private String loadMarkdown() {
        Resource resource = resourceLoader.getResource(BOT_API_MARKDOWN_PATH);
        if (!resource.exists()) {
            throw new ResponseStatusException(NOT_FOUND, "Document not found");
        }
        try {
            return StreamUtils.copyToString(resource.getInputStream(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new ResponseStatusException(INTERNAL_SERVER_ERROR, "Failed to load document");
        }
    }
}
