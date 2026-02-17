import pytest

from app.services.parser import BlockNotFoundError, find_open_seats, parse_xml_root


def test_find_open_seats_match() -> None:
    xml_text = """
    <response>
      <courses>
        <block pn="W" usn="M" key="F57V03" os="0" />
        <block pn="W" usn="M" key="X11111" os="7" />
      </courses>
    </response>
    """

    root = parse_xml_root(xml_text)
    os_value = find_open_seats(root, term_code="W", section_code="M", block_key="F57V03")

    assert os_value == 0


def test_find_open_seats_not_found() -> None:
    xml_text = """
    <response>
      <courses>
        <block pn="W" usn="A" key="ZZZ" os="2" />
      </courses>
    </response>
    """

    root = parse_xml_root(xml_text)

    with pytest.raises(BlockNotFoundError):
        find_open_seats(root, term_code="W", section_code="M", block_key="F57V03")
