package com.fxiaoke.sharecrm.im.gateway.repository;

import com.fxiaoke.sharecrm.im.gateway.entity.Account;
import org.springframework.data.repository.reactive.ReactiveCrudRepository;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Mono;

/**
 * 账号数据访问接口
 */
@Repository
public interface AccountRepository extends ReactiveCrudRepository<Account, Long> {

    /**
     * 根据 appId 查询账号
     */
    Mono<Account> findByAppId(String appId);

    /**
     * 根据 appId 和 appSecret 查询账号
     */
    Mono<Account> findByAppIdAndAppSecret(String appId, String appSecret);
}
