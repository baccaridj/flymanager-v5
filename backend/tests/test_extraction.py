from app.services.extraction import classify, extract


def test_classifies_eticket_with_passenger_locator_ticket():
    text = "ADT - MARIA SILVA LOC ABC123 TICKET 1234567890123 LA8186 GRU-MCO R$ 9.004,30"
    assert classify(text) == "eticket"
    data = extract(text, "eticket")
    assert data["passenger"] == "MARIA SILVA"
    assert data["locator"] == "ABC123"
    assert data["ticket"] == "1234567890123"
    assert data["airline"] == "LA"


def test_classifies_cotacao_from_opcao_text():
    text = "COTACAO PREMIUM OPCAO CM Total premium: BRL 25.437,73"
    assert classify(text) == "cotacao"


def test_classifies_pix():
    text = "COMPROVANTE PIX CHAVE PIX financeiro@fly.com R$ 1.250,00"
    assert classify(text) == "pix"
    assert extract(text, "pix")["values"] == [1250.0]
