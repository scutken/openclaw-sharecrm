package com.fxiaoke.sharecrm.im.gateway.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * EncryptUtil 单元测试
 *
 * @author xiejiay (^_−)☆
 */
class EncryptUtilTest {

    @Test
    void testEncrypt_and_decrypt() {
        String plainText = "Hello, World! 你好世界";
        
        String encrypted = EncryptUtil.encrypt(plainText);
        
        assertNotNull(encrypted);
        assertTrue(EncryptUtil.isEncrypted(encrypted));
        assertNotEquals(plainText, encrypted);
        
        String decrypted = EncryptUtil.decrypt(encrypted);
        assertEquals(plainText, decrypted);
    }

    @Test
    void testEncrypt_jsonContent() {
        String jsonContent = "[{\"ea\":\"test123\",\"appId\":\"app001\",\"appSecret\":\"secret123\",\"botFullId\":\"B.test.bot\",\"enabled\":true}]";
        
        String encrypted = EncryptUtil.encrypt(jsonContent);
        String decrypted = EncryptUtil.decrypt(encrypted);
        
        assertEquals(jsonContent, decrypted);
    }

    @Test
    void testEncrypt_emptyString() {
        String empty = "";
        
        String result = EncryptUtil.encrypt(empty);
        
        assertEquals(empty, result);
    }

    @Test
    void testEncrypt_null() {
        String result = EncryptUtil.encrypt(null);
        
        assertNull(result);
    }

    @Test
    void testDecrypt_emptyString() {
        String result = EncryptUtil.decrypt("");
        
        assertEquals("", result);
    }

    @Test
    void testDecrypt_null() {
        String result = EncryptUtil.decrypt(null);
        
        assertNull(result);
    }

    @Test
    void testDecrypt_unencryptedData() {
        String plainText = "This is not encrypted";
        
        String result = EncryptUtil.decrypt(plainText);
        
        assertEquals(plainText, result);
    }

    @Test
    void testIsEncrypted_withPrefix() {
        String encrypted = "ENC:someBase64Data";
        
        assertTrue(EncryptUtil.isEncrypted(encrypted));
    }

    @Test
    void testIsEncrypted_withoutPrefix() {
        String plainText = "plain text";
        
        assertFalse(EncryptUtil.isEncrypted(plainText));
    }

    @Test
    void testIsEncrypted_null() {
        assertFalse(EncryptUtil.isEncrypted(null));
    }

    @Test
    void testEncrypt_differentResultsForSameInput() {
        String plainText = "same input";
        
        String encrypted1 = EncryptUtil.encrypt(plainText);
        String encrypted2 = EncryptUtil.encrypt(plainText);
        
        // 由于随机IV，相同明文加密结果应该不同
        assertNotEquals(encrypted1, encrypted2);
        
        // 但都能正确解密
        assertEquals(plainText, EncryptUtil.decrypt(encrypted1));
        assertEquals(plainText, EncryptUtil.decrypt(encrypted2));
    }

    @Test
    void testEncrypt_specialCharacters() {
        String plainText = "特殊字符!@#$%^&*()_+-=[]{}|;':\",./<>?\\n\\t";
        
        String encrypted = EncryptUtil.encrypt(plainText);
        String decrypted = EncryptUtil.decrypt(encrypted);
        
        assertEquals(plainText, decrypted);
    }

    @Test
    void testEncrypt_longContent() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 1000; i++) {
            sb.append("这是一段很长的测试内容。");
        }
        String plainText = sb.toString();
        
        String encrypted = EncryptUtil.encrypt(plainText);
        String decrypted = EncryptUtil.decrypt(encrypted);
        
        assertEquals(plainText, decrypted);
    }
}
