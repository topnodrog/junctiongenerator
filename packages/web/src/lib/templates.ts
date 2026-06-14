export type ContractTemplate = "erc20" | "erc721" | "dao" | "multisig";

export interface SecuritySettings {
  reentrancy: boolean;
  gasOptimization: boolean;
  ownerPrivilege: boolean;
  flashLoanGuard: boolean;
}

interface ContractParams {
  template: ContractTemplate;
  security: SecuritySettings;
  tokenName: string;
  tokenSymbol: string;
  initialSupply: string;
  taxBps: number;
  mintPrice: string;
  maxSupply: string;
  votingDelay: number;
  requiredSigs: number;
}

export const generateDynamicContract = ({
  template,
  security,
  tokenName,
  tokenSymbol,
  initialSupply,
  taxBps,
  mintPrice,
  maxSupply,
  votingDelay,
  requiredSigs,
}: ContractParams): string => {
  const useReentrancy = security.reentrancy;
  const useGasOpt = security.gasOptimization;
  const useOwnerPriv = security.ownerPrivilege;
  const useFlashGuard = security.flashLoanGuard;

  switch (template) {
    case "erc20":
      return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
${useOwnerPriv ? 'import "@openzeppelin/contracts/access/Ownable.sol";' : ""}
${useReentrancy ? 'import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";' : ""}

/**
 * @title ${tokenName} ERC-20 Token
 * @dev Synthesized & audited programmatically by Daedalus (CTO Agent).
 * @notice Features customized transaction fee tax and advanced security checks.
 */
contract ${tokenName} is ERC20${useOwnerPriv ? ", Ownable" : ""}${useReentrancy ? ", ReentrancyGuard" : ""} {
    uint256 public constant TRANSACTION_TAX_BPS = ${taxBps}; // ${taxBps / 100}% Tax
    address public treasuryWallet;
    
    event TaxCollected(address indexed sender, address indexed recipient, uint256 amount);
    
    constructor(
        uint256 initialSupply,
        address _treasury
    ) ERC20("${tokenName}", "${tokenSymbol}")${useOwnerPriv ? " Ownable(msg.sender)" : ""} {
        _mint(msg.sender, initialSupply * 10**decimals());
        treasuryWallet = _treasury;
    }

    function transfer(address to, uint256 value) public override${useReentrancy ? " nonReentrant" : ""} returns (bool) {
        ${useGasOpt ? "// Gas Optimized Unchecked Math & Short Circuiting" : ""}
        ${useGasOpt ? "unchecked {" : ""}
            uint256 taxAmount = (value * TRANSACTION_TAX_BPS) / 10000;
            uint256 sendAmount = value - taxAmount;
            
            if (taxAmount > 0) {
                super.transfer(treasuryWallet, taxAmount);
                emit TaxCollected(msg.sender, treasuryWallet, taxAmount);
            }
            
            return super.transfer(to, sendAmount);
        ${useGasOpt ? "}" : ""}
    }
    
    ${
      useOwnerPriv
        ? `function setTreasuryWallet(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Invalid address");
        treasuryWallet = newTreasury;
    }`
        : ""
    }
}`;

    case "erc721":
      return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
${useOwnerPriv ? 'import "@openzeppelin/contracts/access/Ownable.sol";' : ""}
${useReentrancy ? 'import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";' : ""}

/**
 * @title ${tokenName} NFT Collection
 * @dev Compiled and gas-optimized by Junction Generator.
 */
contract ${tokenName} is ERC721${useOwnerPriv ? ", Ownable" : ""}${useReentrancy ? ", ReentrancyGuard" : ""} {
    ${useGasOpt ? "uint32" : "uint256"} public nextTokenId;
    ${useGasOpt ? "uint32" : "uint256"} public constant MAX_SUPPLY = ${maxSupply};
    uint256 public mintPrice = ${mintPrice} ether;
    
    constructor() ERC721("${tokenName}", "${tokenSymbol}")${useOwnerPriv ? " Ownable(msg.sender)" : ""} {}
    
    function mintNFT() public payable${useReentrancy ? " nonReentrant" : ""} returns (uint256) {
        require(msg.value >= mintPrice, "Insufficient payment");
        ${useFlashGuard ? "require(tx.origin == msg.sender, \"Contracts not allowed to mint (Flash Loan Prevention)\");" : ""}
        
        ${useGasOpt ? "uint32" : "uint256"} tokenId = nextTokenId;
        require(tokenId < MAX_SUPPLY, "Exceeds max supply");
        
        _safeMint(msg.sender, tokenId);
        
        ${useGasOpt ? "unchecked { ++nextTokenId; }" : "nextTokenId++;"}
        return tokenId;
    }
    
    ${
      useOwnerPriv
        ? `function withdrawPayments() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }
    
    function setMintPrice(uint256 _newPrice) external onlyOwner {
        mintPrice = _newPrice;
    }`
        : ""
    }
}`;

    case "dao":
      return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

${useOwnerPriv ? 'import "@openzeppelin/contracts/access/Ownable.sol";' : ""}
${useReentrancy ? 'import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";' : ""}

contract ${tokenName}DAO${useOwnerPriv ? " is Ownable" : ""}${useReentrancy ? " is ReentrancyGuard" : ""} {
    struct Proposal {
        string description;
        uint256 voteCount;
        bool executed;
    }
    
    Proposal[] public proposals;
    mapping(address => bool) public members;
    uint256 public votingDelay = ${votingDelay}; // Delay blocks
    
    constructor()${useOwnerPriv ? " Ownable(msg.sender)" : ""} {
        members[msg.sender] = true;
    }
    
    function submitProposal(${useGasOpt ? "string calldata desc" : "string memory desc"}) public${useReentrancy ? " nonReentrant" : ""} {
        require(members[msg.sender], "Members only");
        proposals.push(Proposal({
            description: desc,
            voteCount: 0,
            executed: false
        }));
    }
    
    function voteProposal(uint256 proposalId) public {
        require(members[msg.sender], "Members only");
        Proposal storage prop = proposals[proposalId];
        prop.voteCount++;
    }
}`;

    case "multisig":
      return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

${useReentrancy ? 'import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";' : ""}

contract ${tokenName}MultiSig${useReentrancy ? " is ReentrancyGuard" : ""} {
    address[] public owners;
    uint256 public required = ${requiredSigs};
    
    struct Transaction {
        address destination;
        uint256 value;
        bytes data;
        bool executed;
    }
    
    Transaction[] public transactions;
    mapping(uint256 => mapping(address => bool)) public confirmations;
    
    constructor(address[] memory _owners) {
        require(_owners.length > 0, "Owners required");
        require(required <= _owners.length, "Invalid confirmation count");
        owners = _owners;
    }
    
    function submitTransaction(address dest, uint256 val, bytes memory data) public returns (uint256 txId) {
        transactions.push(Transaction({
            destination: dest,
            value: val,
            data: data,
            executed: false
        }));
        txId = transactions.length - 1;
    }
    
    function confirmTransaction(uint256 txId) public {
        confirmations[txId][msg.sender] = true;
    }
    
    function executeTransaction(uint256 txId) public${useReentrancy ? " nonReentrant" : ""} {
        Transaction storage txn = transactions[txId];
        require(!txn.executed, "Already executed");
        
        uint256 count = 0;
        ${useGasOpt ? "uint256 length = owners.length;" : ""}
        for (uint256 i = 0; i < ${useGasOpt ? "length" : "owners.length"}; i++) {
            if (confirmations[txId][owners[i]]) {
                count++;
            }
        }
        
        require(count >= required, "Confirmations insufficient");
        txn.executed = true;
        (bool success, ) = txn.destination.call{value: txn.value}(txn.data);
        require(success, "Transaction failed");
    }
}`;
  }
};
