package com.fxiaoke.sharecrm.im.gateway.config;

import cn.hutool.core.bean.BeanUtil;
import com.fxiaoke.sharecrm.im.gateway.entity.Account;
import com.github.autoconf.ConfigFactory;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.Yaml;

import javax.annotation.PostConstruct;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 账号配置属性
 */
@Slf4j
@Data
@Component
public class AccountProperties {

    /**
     * 账号列表
     */
    private List<Account> accounts = new ArrayList<>();

    @PostConstruct
    public void init() {
        ConfigFactory.getInstance().getConfig("im-gateway-accounts", config -> {
            String s = new String(config.getContent());
            Yaml yaml = new Yaml();
            Map<String, List<Map<String, Object>>> root = yaml.load(s);
            List<Map<String, Object>> accountMaps = root.get("accounts");
            List<Account> newAccounts = new ArrayList<>();
            for (Map<String, Object> map : accountMaps) {
                newAccounts.add(BeanUtil.toBean(map, Account.class));
            }
            accounts = newAccounts;
            log.info("accounts reloaded, {}", accounts);
        });
    }
}
