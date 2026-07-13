from sqlalchemy import BigInteger, Integer


ID_TYPE = BigInteger().with_variant(Integer, "sqlite")
