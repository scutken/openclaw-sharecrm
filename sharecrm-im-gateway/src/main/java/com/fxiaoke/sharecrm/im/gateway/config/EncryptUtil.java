package com.fxiaoke.sharecrm.im.gateway.config;

import cn.hutool.core.util.StrUtil;
import lombok.extern.slf4j.Slf4j;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * AES-GCM 加密解密工具类
 * 用于对 accounts 配置进行加密存储
 *
 * @author xiejiay (^_−)☆
 */
@Slf4j
public class EncryptUtil {

    private static final String ALGORITHM = "AES";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_LENGTH = 128;
    private static final int GCM_IV_LENGTH = 12;

    /**
     * 加密前缀，用于标识数据已加密
     */
    public static final String ENCRYPTED_PREFIX = "ENC:";

    /**
     * 加密密钥，实际生产环境应从安全配置中获取
     * 32字节 = 256位 AES密钥
     */
    private static final String SECRET_KEY = "SharecrmImGateway@2026!Encrypt";

    /**
     * 加密字符串
     *
     * @param plainText 明文
     * @return 加密后的字符串（Base64编码，带ENC:前缀）
     */
    public static String encrypt(String plainText) {
        if (StrUtil.isEmpty(plainText)) {
            return plainText;
        }
        try {
            byte[] iv = generateIv();
            SecretKeySpec keySpec = new SecretKeySpec(SECRET_KEY.getBytes(StandardCharsets.UTF_8), ALGORITHM);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            GCMParameterSpec gcmParameterSpec = new GCMParameterSpec(GCM_TAG_LENGTH, iv);
            cipher.init(Cipher.ENCRYPT_MODE, keySpec, gcmParameterSpec);
            byte[] encrypted = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));
            
            // 将IV和加密数据合并
            byte[] combined = new byte[iv.length + encrypted.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(encrypted, 0, combined, iv.length, encrypted.length);
            
            return ENCRYPTED_PREFIX + Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
            log.error("加密失败", e);
            throw new RuntimeException("加密失败", e);
        }
    }

    /**
     * 解密字符串
     *
     * @param encryptedText 加密的字符串（Base64编码，带ENC:前缀）
     * @return 解密后的明文
     */
    public static String decrypt(String encryptedText) {
        if (StrUtil.isEmpty(encryptedText)) {
            return encryptedText;
        }
        
        // 如果不是加密格式，直接返回原文（兼容旧数据）
        if (!isEncrypted(encryptedText)) {
            return encryptedText;
        }
        
        try {
            String base64Data = encryptedText.substring(ENCRYPTED_PREFIX.length());
            byte[] combined = Base64.getDecoder().decode(base64Data);
            
            // 提取IV和加密数据
            byte[] iv = new byte[GCM_IV_LENGTH];
            byte[] encrypted = new byte[combined.length - GCM_IV_LENGTH];
            System.arraycopy(combined, 0, iv, 0, GCM_IV_LENGTH);
            System.arraycopy(combined, GCM_IV_LENGTH, encrypted, 0, encrypted.length);
            
            SecretKeySpec keySpec = new SecretKeySpec(SECRET_KEY.getBytes(StandardCharsets.UTF_8), ALGORITHM);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            GCMParameterSpec gcmParameterSpec = new GCMParameterSpec(GCM_TAG_LENGTH, iv);
            cipher.init(Cipher.DECRYPT_MODE, keySpec, gcmParameterSpec);
            byte[] decrypted = cipher.doFinal(encrypted);
            
            return new String(decrypted, StandardCharsets.UTF_8);
        } catch (Exception e) {
            log.error("解密失败", e);
            throw new RuntimeException("解密失败", e);
        }
    }

    /**
     * 判断字符串是否已加密
     *
     * @param text 字符串
     * @return 是否已加密
     */
    public static boolean isEncrypted(String text) {
        return text != null && text.startsWith(ENCRYPTED_PREFIX);
    }

    /**
     * 生成随机IV
     */
    private static byte[] generateIv() {
        byte[] iv = new byte[GCM_IV_LENGTH];
        new java.security.SecureRandom().nextBytes(iv);
        return iv;
    }
}
