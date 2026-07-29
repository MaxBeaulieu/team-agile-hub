using System.Security.Cryptography;
using System.Text;

namespace Backend.Services;

/// <summary>
/// AES-256-CBC encryption for Jira OAuth tokens stored in the database,
/// and HMAC-SHA256 signing for the OAuth state parameter.
/// The key is a 64-character hex string (32 bytes) from Encryption:Key config.
/// </summary>
public class JiraEncryptionService
{
    private readonly byte[]? _key;

    public JiraEncryptionService(IConfiguration config)
    {
        var hex = config["Encryption:Key"];
        if (!string.IsNullOrWhiteSpace(hex))
            _key = Convert.FromHexString(hex);
    }

    public string Encrypt(string plaintext)
    {
        EnsureKey();
        using var aes = Aes.Create();
        aes.Key = _key!;
        aes.GenerateIV();
        using var encryptor = aes.CreateEncryptor();
        var plaintextBytes = Encoding.UTF8.GetBytes(plaintext);
        var cipherBytes    = encryptor.TransformFinalBlock(plaintextBytes, 0, plaintextBytes.Length);
        // Prepend the 16-byte IV to the ciphertext
        var result = new byte[aes.IV.Length + cipherBytes.Length];
        aes.IV.CopyTo(result, 0);
        cipherBytes.CopyTo(result, aes.IV.Length);
        return Convert.ToBase64String(result);
    }

    public string Decrypt(string ciphertext)
    {
        EnsureKey();
        var data = Convert.FromBase64String(ciphertext);
        using var aes = Aes.Create();
        aes.Key = _key!;
        aes.IV  = data[..16];
        using var decryptor = aes.CreateDecryptor();
        var plainBytes = decryptor.TransformFinalBlock(data, 16, data.Length - 16);
        return Encoding.UTF8.GetString(plainBytes);
    }

    /// <summary>
    /// Creates a signed state token containing the teamId and a timestamp.
    /// Format (base64): "{teamId}:{unixTimestamp}:{hmac-base64}"
    /// </summary>
    public string CreateState(Guid teamId)
    {
        EnsureKey();
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
        var payload   = $"{teamId}:{timestamp}";
        var sig       = ComputeHmac(payload);
        return Convert.ToBase64String(Encoding.UTF8.GetBytes($"{payload}:{sig}"));
    }

    /// <summary>
    /// Validates the state token and returns the teamId if valid, or null if invalid/expired.
    /// </summary>
    public Guid? ValidateState(string state, int maxAgeSeconds = 600)
    {
        try
        {
            var decoded = Encoding.UTF8.GetString(Convert.FromBase64String(state));
            // Format: "teamId:timestamp:sig" where sig may contain '+'
            var firstColon  = decoded.IndexOf(':');
            var secondColon = decoded.IndexOf(':', firstColon + 1);
            if (firstColon < 0 || secondColon < 0) return null;

            var teamIdStr  = decoded[..firstColon];
            var timestamp  = decoded[(firstColon + 1)..secondColon];
            var signature  = decoded[(secondColon + 1)..];
            var payload    = $"{teamIdStr}:{timestamp}";
            var expected   = ComputeHmac(payload);

            if (!CryptographicOperations.FixedTimeEquals(
                    Encoding.UTF8.GetBytes(expected),
                    Encoding.UTF8.GetBytes(signature)))
                return null;

            var age = DateTimeOffset.UtcNow.ToUnixTimeSeconds() - long.Parse(timestamp);
            if (age > maxAgeSeconds || age < -60) return null;

            return Guid.Parse(teamIdStr);
        }
        catch
        {
            return null;
        }
    }

    private string ComputeHmac(string data)
    {
        using var hmac = new HMACSHA256(_key!);
        return Convert.ToBase64String(hmac.ComputeHash(Encoding.UTF8.GetBytes(data)));
    }

    private void EnsureKey()
    {
        if (_key is null)
            throw new InvalidOperationException(
                "Encryption:Key is not configured. Add a 64-character hex key to your environment.");
    }
}
