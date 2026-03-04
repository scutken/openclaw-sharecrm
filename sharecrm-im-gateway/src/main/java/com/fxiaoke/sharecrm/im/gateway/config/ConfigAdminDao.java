package com.fxiaoke.erpdss.ipaas.developer.dao.config;

import cn.hutool.core.util.StrUtil;
import com.fxiaoke.erpdss.ipaas.common.exception.IPaaSSystemException;
import com.fxiaoke.erpdss.ipaas.common.util.JsonUtil;
import com.fxiaoke.erpdss.ipaas.developer.model.IniConfigItem;
import com.fxiaoke.erpdss.ipaas.developer.util.ConfigUtil;
import com.fxiaoke.erpdss.ipaas.springcommon.model.ConnectorDefinition;
import com.fxiaoke.erpdss.ipaas.springcommon.model.HubInfo;
import com.github.autoconf.admin.ConfigAdminClient;
import com.github.autoconf.admin.api.IConfigAdmin;
import com.github.autoconf.base.ProcessInfo;
import com.github.autoconf.helper.ConfigHelper;
import com.github.autoconf.intern.InnerUtils;
import com.github.shiro.support.ShiroUser;
import lombok.extern.slf4j.Slf4j;
import org.apache.shiro.SecurityUtils;
import org.apache.shiro.subject.Subject;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.util.List;

/**
 * 开发者服务实现类
 *
 * @author xiejiay (^_−)☆
 */
@Slf4j
@Service
public class ConfigAdminDao {
    private final IConfigAdmin iConfigAdmin = new ConfigAdminClient();
    private final String hubInfoJsonKey = "hub.hubInfoJson";
    private final String connectorJsonKey = "hub.connectorJson";

    // 审批 https://www.fxiaoke.com/XV/Home/Index#stream/showfeed2019/=/id-9409943
    private final String connectorConfigName = "spring-cloud-erp-ipaas";
    private final String connectorConfigToken = "0A5E41AB5226E0BD6B29ECD00CD9E7E3D1FD8B954F721094661783E8034C86AC";
    // ei配置
    private String eiConfigToken = "B60C41865B61CBD899144BEE75DE1CCEDB19F52CAD29D4F3D1FCE9FB24A5B0D4";   //走普通审批申请，
    private String eiConfigName = "variables_erp_ei_env";  //配置文件名

    /**
     * fstest或者foneshare
     */
    private String globalProfile = "undefined";

    @PostConstruct
    public void init() {
        ProcessInfo process = ConfigHelper.getProcessInfo();
        if (StrUtil.contains(process.getProfile(), "fstest") || StrUtil.contains(process.getProfileCandidates(), "fstest")) {
            globalProfile = "fstest";
        } else if (StrUtil.contains(process.getProfile(), "foneshare") || StrUtil.contains(process.getProfileCandidates(), "foneshare")) {
            globalProfile = "foneshare";
        }
        log.info("ConfigAdminDao init for {} ", globalProfile);
    }

    public List<IniConfigItem> getEiEnvConfigs() {
        String config;
        try {
            config = iConfigAdmin.get(eiConfigToken, globalProfile, eiConfigName);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        if (config == null) {
            throw new IPaaSSystemException("not found config");
        }
        List<IniConfigItem> iniConfigItems = ConfigUtil.parseToItems(config);
        return iniConfigItems;
    }

    public List<HubInfo> getAllHubs() {
        List<HubInfo> allHubs = JsonUtil.fromJsonToList(getConnectorConfigValueNotNull(hubInfoJsonKey), HubInfo.class);
        return allHubs;
    }


    public String getConnectorsJson() {
        return getConnectorConfigValueNotNull(connectorJsonKey);
    }

    public List<ConnectorDefinition> getAllConnectors() {
        List<ConnectorDefinition> allConnectors = JsonUtil.fromJsonToList(getConnectorConfigValueNotNull(connectorJsonKey), ConnectorDefinition.class);
        return allConnectors;
    }

    /**
     * 不考虑向后兼容，所以如果类变化了，一定得使用最新版本修改！！！
     *
     * @param hubInfo Hub 信息
     */
    public void upsertHubConfig(HubInfo hubInfo) {
        if (hubInfo == null || hubInfo.getName() == null || hubInfo.getName().trim().isEmpty()) {
            throw new IllegalArgumentException("hubInfo and hubInfo.name must not be null or empty");
        }

        List<HubInfo> allHubs = JsonUtil.fromJsonToList(getConnectorConfigValueNotNull(hubInfoJsonKey), HubInfo.class);

        // 查找同名 Hub，存在则替换，不存在则新增
        int foundIndex = -1;
        for (int i = 0; i < allHubs.size(); i++) {
            HubInfo h = allHubs.get(i);
            if (h != null && hubInfo.getName().equals(h.getName())) {
                foundIndex = i;
                break;
            }
        }

        if (foundIndex >= 0) {
            allHubs.set(foundIndex, hubInfo);
            log.info("upsertHubConfig: replaced existing hub '{}'", hubInfo.getName());
        } else {
            allHubs.add(hubInfo);
            log.info("upsertHubConfig: added new hub '{}'", hubInfo.getName());
        }

        try {
            iConfigAdmin.update2(connectorConfigToken, globalProfile, connectorConfigName, hubInfoJsonKey, JsonUtil.toJsonIgnoreNull(allHubs), getEditor());
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    public void deleteHubConfig(String hubName) {
        List<HubInfo> allHubs = JsonUtil.fromJsonToList(getConnectorConfigValueNotNull(hubInfoJsonKey), HubInfo.class);
        allHubs.removeIf(hub -> hub.getName().equals(hubName));
        try {
            iConfigAdmin.update2(connectorConfigToken, globalProfile, connectorConfigName, hubInfoJsonKey, JsonUtil.toJsonIgnoreNull(allHubs), getEditor());
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    public void upsertConnectorDefinition(ConnectorDefinition newConnector) {
        if (newConnector == null || newConnector.getConnectorKey() == null || newConnector.getConnectorKey().trim().isEmpty()) {
            throw new IllegalArgumentException("connectorDefinition and connectorDefinition.connectorKey must not be null or empty");
        }

        List<ConnectorDefinition> allConnectors = JsonUtil.fromJsonToList(getConnectorConfigValueNotNull(connectorJsonKey), ConnectorDefinition.class);

        // 查找已存在的连接器（优先匹配 connectorKey 与 hubName 都相等，其次仅匹配 connectorKey）

        int foundIndex = -1;
        for (int i = 0; i < allConnectors.size(); i++) {
            if (allConnectors.get(i) != null && newConnector.getConnectorKey().equals(allConnectors.get(i).getConnectorKey())) {
                foundIndex = i;
                break;
            }
        }

        if (foundIndex >= 0) {
            allConnectors.set(foundIndex, newConnector);
            log.info("upsertConnectorDefinition: replaced existing connector '{}'", newConnector.getConnectorKey());
        } else {
            allConnectors.add(newConnector);
            log.info("upsertConnectorDefinition: added new connector '{}'", newConnector.getConnectorKey());
        }
        String connectorJson = JsonUtil.toJsonIgnoreNull(allConnectors);

        updateConnectorJson(connectorJson);
    }

    public void updateConnectorJson(String connectorJson) {
        try {
            iConfigAdmin.update2(connectorConfigToken, globalProfile, connectorConfigName, connectorJsonKey, connectorJson, getEditor());
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    public void deleteConnectorDefinition(String connectorKey) {
        if (connectorKey == null) {
            throw new IllegalArgumentException("connectorDefinition and connectorDefinition.connectorKey must not be null or empty");
        }

        List<ConnectorDefinition> allConnectors = JsonUtil.fromJsonToList(getConnectorConfigValueNotNull(connectorJsonKey), ConnectorDefinition.class);

        // 如果提供了 hubName，则仅删除匹配 hubName 的项；否则删除所有相同 connectorKey 的项
        allConnectors.removeIf(conn -> connectorKey.equals(conn.getConnectorKey()));
        updateConnectorJson(JsonUtil.toJsonIgnoreNull(allConnectors));
    }

    private String getConnectorConfigValueNotNull(String key) {
        String config = null;
        try {
            config = iConfigAdmin.get(connectorConfigToken, globalProfile, connectorConfigName);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        if (config == null) {
            throw new IPaaSSystemException("not found config");
        }
        String configValue = InnerUtils.from(config).get(key);
        if (configValue == null) {
            throw new IPaaSSystemException("not found config");
        }
        return configValue;
    }

    private String getEditor() {
        try {
            Subject subject = SecurityUtils.getSubject();
            ShiroUser user = (ShiroUser) subject.getPrincipal();
            return user.getDisplayName();
        } catch (Exception ignored) {
        }
        return null;
    }

    public void updateEiEnvConfig(IniConfigItem iniConfigItem) {
        try {
            iConfigAdmin.update2(eiConfigToken, globalProfile, eiConfigName, iniConfigItem.getKey(), iniConfigItem.getValue(), getEditor());
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}