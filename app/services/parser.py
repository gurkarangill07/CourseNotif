from __future__ import annotations

import xml.etree.ElementTree as ET


class InvalidXmlError(Exception):
    pass


class BlockNotFoundError(Exception):
    pass


def parse_xml_root(xml_text: str) -> ET.Element:
    try:
        return ET.fromstring(xml_text)
    except ET.ParseError as exc:
        raise InvalidXmlError(f"invalid XML: {exc}") from exc


def find_open_seats(
    root: ET.Element,
    *,
    term_code: str,
    section_code: str,
    block_key: str,
) -> int:
    expected_term = term_code.strip().upper()
    expected_section = section_code.strip().upper()
    expected_key = block_key.strip().upper()

    for block in root.iter("block"):
        pn = (block.attrib.get("pn") or "").strip().upper()
        usn = (block.attrib.get("usn") or "").strip().upper()
        key = (block.attrib.get("key") or "").strip().upper()

        if pn == expected_term and usn == expected_section and key == expected_key:
            raw_os = (block.attrib.get("os") or "").strip()
            if raw_os == "":
                raise BlockNotFoundError(
                    "matched block is missing os attribute"
                )
            try:
                return int(raw_os)
            except ValueError as exc:
                raise BlockNotFoundError(
                    f"matched block has non-integer os value: {raw_os}"
                ) from exc

    raise BlockNotFoundError(
        f"no block found for pn={expected_term}, usn={expected_section}, key={expected_key}"
    )
