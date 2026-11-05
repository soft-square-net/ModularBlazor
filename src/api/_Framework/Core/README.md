## 1. The Role of Core (Domain & Application Layers)
- #### The Core library is the beating heart of your application. It contains all your enterprise business logic and application rules, completely free of external technical concerns.

- #### Domain Model: Entities, Value Objects, Domain Events, Enums, and custom Business Exceptions. These define what your business is, independent of databases or UI.

- #### Application Interfaces (Ports): Abstract contracts defining what operations are needed (e.g., IUserRepository, IEmailService, IUnitOfWork). Core defines these interfaces; it does not know how they are implemented.

- #### Use Cases / Orchestration: Command and Query handlers (using patterns like MediatR), validation rules (FluentValidation), and DTOs that orchestrate business workflows.

- #### Zero External Dependencies: Core should never reference Entity Framework Core, ASP.NET Core, database drivers, or third-party SDKs. It only knows about pure C# and domain-centric abstractions.