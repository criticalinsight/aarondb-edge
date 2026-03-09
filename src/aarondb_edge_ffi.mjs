export function phash2(data) {
    let s = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
        hash = ((hash << 5) - hash) + s.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
}

export function byte_size(bits) {
    return bits.buffer.byteLength;
}
