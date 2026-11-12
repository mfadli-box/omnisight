"""domain/ — layer terdalam QA suite.

ATURAN: ZERO import httpx, requests, pytest, atau modul OS — hanya
stdlib murni (dataclasses, typing, enum). Arsitektur: dependensi selalu
mengarah ke dalam (infrastructure -> application -> domain).
"""

from domain.errors import (
    ContractViolationError,
    DomainError,
    UnreachableTargetError,
)
from domain.gateways import ApiClient
from domain.models import (
    ApiEndpoint,
    ApiResponseSnapshot,
    EndpointMethod,
    HealthSnapshot,
    TestCaseScenario,
)

__all__ = [
    "ApiClient",
    "ApiEndpoint",
    "ApiResponseSnapshot",
    "ContractViolationError",
    "DomainError",
    "EndpointMethod",
    "HealthSnapshot",
    "TestCaseScenario",
    "UnreachableTargetError",
]
