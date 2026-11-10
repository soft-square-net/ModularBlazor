using System.Text;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using soft.square.net.ModularBlazor.Core.Exceptions;
using soft.square.net.ModularBlazor.Core.Pagination;
using soft.square.net.ModularBlazor.Host.Modules.Media.Application.Images;

namespace soft.square.net.ModularBlazor.Host.Modules.Media.Infrastructure.Endpoints;

/// <summary>
/// Images saved by MudTail's MudImageEditor: /api/v1/media/images (any signed-in user, JWT or API key; tenant scoped).
/// Mirrors the editor's two upload modes: one multipart request (<c>upload.mode: 'multipart'</c>) or one raw request per
/// size plus the recipe as JSON (<c>upload.mode: 'stream'</c>). See src/MudTail/README.md, "Image editor".
/// </summary>
public sealed class MediaImageEndpoints : ICarterModule
{
    private static readonly string[] ReservedParts = ["original", "meta", "recipe"];

    public void AddRoutes(IEndpointRouteBuilder app)
    {
        var options = app.ServiceProvider.GetRequiredService<MediaOptions>();
        var multipartLimit = options.MaxOriginalBytes + options.MaxVariantBytes * options.MaxVariants + 2L * options.MaxRecipeBytes;

        var group = app.MapGroup("/api/v1/media/images").WithTags("Media").RequireAuthorization();

        group.MapGet("/", async ([AsParameters] PaginationFilter filter, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new SearchMediaImagesQuery(filter), ct)))
            .WithName("SearchMediaImages")
            .WithSummary("Page through images (keyword on Name, filters, orderBy; newest first by default)")
            .Produces<PagedResponse<MediaImageSummaryDto>>();

        group.MapGet("/{id:guid}", async (Guid id, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new GetMediaImageQuery(id), ct)))
            .WithName("GetMediaImage")
            .WithSummary("An image with its variants and recipe")
            .Produces<MediaImageDto>()
            .ProducesProblem(StatusCodes.Status404NotFound);

        // ---- multipart: original? + files + meta + recipe in one request
        group.MapPost("/", async (IFormCollection form, ISender sender, CancellationToken ct) =>
            {
                var original = form.Files.GetFile("original");
                var files = form.Files.Where(f => !ReservedParts.Contains(f.Name, StringComparer.OrdinalIgnoreCase)).Select(ToPart).ToList();
                var command = new CreateMediaImageCommand(
                    original is null ? null : ToPart(original), files,
                    await TextPartAsync(form, "meta", options.MaxRecipeBytes, ct),
                    await TextPartAsync(form, "recipe", options.MaxRecipeBytes, ct));
                var image = await sender.Send(command, ct);
                return Results.Created($"/api/v1/media/images/{image.Id}", image);
            })
            .DisableAntiforgery()   // bearer / API-key API: no cookies, no CSRF
            .WithMetadata(new RequestSizeLimitAttribute(multipartLimit))
            .WithFormOptions(multipartBodyLengthLimit: multipartLimit, valueLengthLimit: options.MaxRecipeBytes + 1024)
            .Accepts<IFormCollection>("multipart/form-data")
            .WithName("CreateMediaImage")
            .WithSummary("Upload an edited image: 'files' (one part per size), 'meta' JSON, 'recipe' JSON and optionally the untouched 'original'")
            .Produces<MediaImageDto>(StatusCodes.Status201Created)
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status413PayloadTooLarge)
            .ProducesProblem(StatusCodes.Status415UnsupportedMediaType);

        // ---- stream mode: the body is the image; the image is created on the first write to a new id
        group.MapMethods("/{id:guid}/variants/{size}", ["POST", "PUT"], async (Guid id, string size, HttpRequest request, ISender sender, CancellationToken ct) =>
            {
                var headerSize = request.Headers["X-Image-Size"].ToString();
                if (headerSize.Length > 0 && !string.Equals(headerSize, size, StringComparison.OrdinalIgnoreCase))
                    throw new CustomException($"X-Image-Size '{headerSize}' does not match the size '{size}' in the URL.");
                var command = new PutMediaVariantCommand(id, size, BodyPart(request),
                    IntHeader(request, "X-Image-Width"), IntHeader(request, "X-Image-Height"));
                return Results.Ok(await sender.Send(command, ct));
            })
            .WithMetadata(new RequestSizeLimitAttribute(options.MaxVariantBytes))
            .WithName("PutMediaVariant")
            .WithSummary("Store one size (stream mode): raw body plus X-File-Name, X-Image-Size, X-Image-Width and X-Image-Height")
            .Produces<MediaImageDto>()
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status413PayloadTooLarge)
            .ProducesProblem(StatusCodes.Status415UnsupportedMediaType);

        group.MapMethods("/{id:guid}/original", ["POST", "PUT"], async (Guid id, HttpRequest request, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new PutMediaOriginalCommand(id, BodyPart(request)), ct)))
            .WithMetadata(new RequestSizeLimitAttribute(options.MaxOriginalBytes))
            .WithName("PutMediaOriginal")
            .WithSummary("Store the untouched original (stream mode, upload.includeOriginal): raw body plus X-File-Name")
            .Produces<MediaImageDto>()
            .ProducesProblem(StatusCodes.Status409Conflict)
            .ProducesProblem(StatusCodes.Status413PayloadTooLarge)
            .ProducesProblem(StatusCodes.Status415UnsupportedMediaType);

        // PUT is the REST verb; POST is accepted too because the editor sends the recipe with upload.method.
        group.MapMethods("/{id:guid}/recipe", ["PUT", "POST"], async (Guid id, HttpRequest request, ISender sender, CancellationToken ct) =>
            {
                var json = await ReadTextAsync(request.Body, options.MaxRecipeBytes, "The recipe", ct);
                return Results.Ok(await sender.Send(new SetMediaRecipeCommand(id, json), ct));
            })
            .WithMetadata(new RequestSizeLimitAttribute(options.MaxRecipeBytes + 1024))
            // No Accepts(...) on the raw-body endpoints: it makes routing answer 415 with no detail before the handler
            // runs. The handler checks the bytes and answers with a problem response instead.
            .WithName("SetMediaRecipe")
            .WithSummary("Store the recipe ({ \"type\": \"mudtail.image-recipe\", \"version\": 1, … }), kept byte for byte")
            .Produces<MediaImageDto>()
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapGet("/{id:guid}/recipe", async (Guid id, ISender sender, CancellationToken ct)
                => Results.Text(await sender.Send(new GetMediaRecipeQuery(id), ct), "application/json", Encoding.UTF8))
            .WithName("GetMediaRecipe")
            .WithSummary("The recipe exactly as stored (replay it with MudTail's renderRecipe(original, recipe))")
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapGet("/{id:guid}/original", async (Guid id, ISender sender, CancellationToken ct) =>
                FileResult(await sender.Send(new OpenMediaFileQuery(id, null), ct)))
            .WithName("GetMediaOriginal")
            .WithSummary("Download the untouched original")
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapGet("/{id:guid}/variants/{size}", async (Guid id, string size, ISender sender, CancellationToken ct) =>
                FileResult(await sender.Send(new OpenMediaFileQuery(id, size), ct)))
            .WithName("GetMediaVariant")
            .WithSummary("Download one size")
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapDelete("/{id:guid}", async (Guid id, ISender sender, CancellationToken ct) =>
            {
                await sender.Send(new DeleteMediaImageCommand(id), ct);
                return Results.NoContent();
            })
            .WithName("DeleteMediaImage")
            .WithSummary("Delete an image (soft delete; the files stay in the store)")
            .Produces(StatusCodes.Status204NoContent)
            .ProducesProblem(StatusCodes.Status404NotFound);
    }

    private static IResult FileResult(MediaFileContent file)
        => Results.Stream(file.Content, file.ContentType, file.FileName, enableRangeProcessing: true);

    private static MediaFilePart ToPart(IFormFile file) => new(file.FileName, file.ContentType, file.OpenReadStream);

    /// <summary>The raw request body as a file part. The stream is not buffered: it goes straight to the store.</summary>
    private static MediaFilePart BodyPart(HttpRequest request)
    {
        var fileName = request.Headers["X-File-Name"].ToString();
        if (fileName.Length > 0)
        {
            try { fileName = Uri.UnescapeDataString(fileName); } catch (UriFormatException) { /* keep as sent */ }
            fileName = Path.GetFileName(fileName);
        }
        return new MediaFilePart(fileName.Length > 0 ? fileName : null, request.ContentType, () => new NonClosingStream(request.Body));
    }

    private static int? IntHeader(HttpRequest request, string name)
    {
        var value = request.Headers[name].ToString();
        if (value.Length == 0) return null;
        return int.TryParse(value, System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out var n)
            ? n
            : throw new CustomException($"{name} must be a whole number of pixels.");
    }

    /// <summary>A text part (meta / recipe) sent as a form value or as a file.</summary>
    private static async Task<string?> TextPartAsync(IFormCollection form, string name, int maxBytes, CancellationToken ct)
    {
        if (form.TryGetValue(name, out var value) && value.Count > 0) return value.ToString();
        var file = form.Files.GetFile(name);
        if (file is null) return null;
        await using var stream = file.OpenReadStream();
        return await ReadTextAsync(stream, maxBytes, $"The '{name}' part", ct);
    }

    private static async Task<string> ReadTextAsync(Stream stream, int maxBytes, string what, CancellationToken ct)
    {
        using var buffer = new MemoryStream();
        var chunk = new byte[16 * 1024];
        int read;
        while ((read = await stream.ReadAsync(chunk, ct)) > 0)
        {
            if (buffer.Length + read > maxBytes)
                throw new CustomException($"{what} is larger than {maxBytes / 1024} KB.", System.Net.HttpStatusCode.RequestEntityTooLarge);
            buffer.Write(chunk, 0, read);
        }
        return Encoding.UTF8.GetString(buffer.GetBuffer(), 0, (int)buffer.Length);
    }

    /// <summary>The request body must not be disposed by the handler.</summary>
    private sealed class NonClosingStream(Stream inner) : Stream
    {
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override int Read(byte[] buffer, int offset, int count) => inner.Read(buffer, offset, count);
        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) => inner.ReadAsync(buffer, cancellationToken);
        public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) => inner.ReadAsync(buffer, offset, count, cancellationToken);
        public override void Flush() { }
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        protected override void Dispose(bool disposing) { }
        public override ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }
}
