// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ISpendLimit {
    function checkSpendingLimit(address _account, address _token, uint _amount) external;
}

contract SpendLimit is ISpendLimit {
    
    uint public ONE_DAY = 24 hours; // 86400 seconds

    /// This struct serves as data storage of daily limits users enable
    /// limit: amount of daily spending limit 
    /// available: available amount that can be spent 
    /// resetTime: block.timestamp either at the activation or at each reset event.
    /// isEnabled: true when daily spending limit is enabled
    struct Limit {
        uint limit;
        uint available;
        uint resetTime;
        bool isEnabled;
    }

    // mapping to 
    // account => token => Limit
    mapping(address => mapping(address => Limit)) public limits; 

    /// @dev this function enables a daily spending limit for specific token.
    /// @param _account account abstraction wallet. should be msg.sender.
    /// @param _token ETH or ERC20 token address that the given spending limit is applied to.
    /// @param _amount non-zero limit.
    function setSpendingLimit(address _account, address _token, uint _amount) external {
        require(msg.sender == _account, "Invalid admin");
        require(_amount != 0, "Invalid amount");
        _updateLimit(_account, _token, _amount, _amount, block.timestamp, true);
    } 

    /// @dev this function disables an active daily spending limit,
    /// decreasing each uint number in Limit struct to zero and making isEnabled false.
    function removeSpendingLimit(address _account, address _token) external {
        require(msg.sender == _account, "Invalid admin");
        _updateLimit(_account, _token, 0, 0, 0, false);
    }

    /// @dev this is a storage-modifying internal function called by either setSpendingLimit or removeSpendingLimit
    function _updateLimit(address _account, address _token, uint _limit, uint _available, uint _resetTime, bool _isEnabled) internal {
        Limit storage limit = limits[_account][_token];

        // Reverts unless it is called after 24 hours have passed since last update.
        // Ensure that users can't freely modify(increase or remove) the daily limit to spend more.
        require(block.timestamp >= limit.resetTime + ONE_DAY, "Invalid update");

        limit.limit = _limit;
        limit.available = _available;
        limit.resetTime = _resetTime;
        limit.isEnabled = _isEnabled;
    }

    /// @dev this function is called by account before execution.
    /// Verify an account is able to spend a given amount of token and records a new available amount.
    function checkSpendingLimit(address _account, address _token, uint _amount) public {
        require(msg.sender == _account, "Invalid admin");
        Limit memory limit = limits[_account][_token];

        // return if spending limit is disabled
        if(!limit.isEnabled) return;

        // Resetting Limit struct state, which is only performed...
        // if a day has already passed since either activation or last reset.
        if (block.timestamp >= limit.resetTime + ONE_DAY) {
            limit.resetTime = block.timestamp;
            limit.available = limit.limit;
        }

        // reverts if amount exceeds the remaining limit. 
        require(limit.available >= _amount, 'Exceed spending limit');

        // decrement `available` 
        limit.available -= _amount;
        limits[_account][_token] = limit;
    }

    // testing purpose
    function getLimit(address _account, address _token) public view returns(Limit memory) {
        return limits[_account][_token];
    }

    // testing purpose: can set it to 10~30 sec.
    // function changeONE_DAY(uint _time) public {
    //     ONE_DAY = _time;
    // }

}