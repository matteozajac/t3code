import Foundation

struct BridgeEnvelope: Codable, Sendable {
    var command: BridgeCommand?
    var reply: BridgeReply?
    var commandID: UUID?
}

enum BridgeCodec {
    static let maximumPayloadBytes = 55_000

    static func encode<T: Encodable>(_ value: T) throws -> Data {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return try encoder.encode(value)
    }

    static func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        guard data.count <= maximumPayloadBytes else { throw CodecError.oversized }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)
            if let date = try? Date(value, strategy: .iso8601) { return date }
            if let date = try? Date(value, strategy: .iso8601.time(includingFractionalSeconds: true)) {
                return date
            }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected an ISO 8601 date.")
        }
        return try decoder.decode(type, from: data)
    }

    enum CodecError: Error { case oversized }
}
